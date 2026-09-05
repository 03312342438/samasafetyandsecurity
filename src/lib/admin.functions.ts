import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required");
}

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: roles, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });

    const hiddenEmail = (process.env.HIDDEN_ADMIN_EMAIL ?? "").toLowerCase();

    return (profiles ?? [])
      .map((p: any) => ({
        ...p,
        roles: roleMap.get(p.id) ?? [],
      }))
      // The hidden super-admin stays fully hidden from every listing. The
      // database "hidden" flag is the reliable source of truth (works even when
      // the env secret is unavailable); the email check is a secondary guard.
      .filter(
        (p: any) =>
          p.hidden !== true && (p.email ?? "").toLowerCase() !== hiddenEmail,
      );
  });

const roleSchema = z.object({ id: z.string().uuid() });

export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => roleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // RLS allows admins to insert roles — no service role key needed.
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", data.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: data.id, role: "admin" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => roleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.id === userId) throw new Error("You cannot remove your own admin rights.");

    // Protect the hidden super-admin from ever losing its role.
    const hiddenEmail = (process.env.HIDDEN_ADMIN_EMAIL ?? "").toLowerCase();
    const { data: target } = await supabase
      .from("profiles")
      .select("email, hidden")
      .eq("id", data.id)
      .maybeSingle();
    if (target?.hidden === true || (hiddenEmail && (target?.email ?? "").toLowerCase() === hiddenEmail)) {
      throw new Error("This account's admin rights cannot be changed.");
    }

    // RLS allows admins to delete roles — no service role key needed.
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.id)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const createSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  full_name: z.string().trim().min(1).max(120),
  designation: z.string().trim().max(120).default(""),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // Create the auth account through the public sign-up endpoint — no service
    // role key required. A throwaway client keeps the new session isolated from
    // the admin's own session.
    const { createClient } = await import("@supabase/supabase-js");
    const publicClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: signUp, error: signUpErr } = await publicClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { full_name: data.full_name } },
    });
    if (signUpErr) throw new Error(signUpErr.message);
    const uid = signUp.user?.id;
    if (!uid) throw new Error("Failed to create user");

    // RLS allows admins to insert profiles and roles directly.
    const { error: pErr } = await supabase.from("profiles").upsert({
      id: uid,
      full_name: data.full_name,
      designation: data.designation,
      email: data.email,
      status: "approved",
    });
    if (pErr) throw new Error(pErr.message);

    const { data: roleExists } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", uid)
      .eq("role", "employee")
      .maybeSingle();
    if (!roleExists) {
      const { error: roleErr } = await supabase
        .from("user_roles")
        .insert({ user_id: uid, role: "employee" });
      if (roleErr) throw new Error(roleErr.message);
    }

    return { ok: true, id: uid };
  });

export const setEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), password: z.string().min(6).max(72) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Protect the hidden super-admin from password changes by other admins.
    const hiddenEmail = (process.env.HIDDEN_ADMIN_EMAIL ?? "").toLowerCase();
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email, hidden")
      .eq("id", data.id)
      .maybeSingle();
    if (target?.hidden === true || (hiddenEmail && (target?.email ?? "").toLowerCase() === hiddenEmail)) {
      throw new Error("This account's password cannot be changed here.");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.id === userId) throw new Error("You cannot delete your own account.");

    // Protect the hidden super-admin from removal.
    const hiddenEmail = (process.env.HIDDEN_ADMIN_EMAIL ?? "").toLowerCase();
    const { data: target } = await supabase
      .from("profiles")
      .select("email, hidden")
      .eq("id", data.id)
      .maybeSingle();
    if (target?.hidden === true || (hiddenEmail && (target?.email ?? "").toLowerCase() === hiddenEmail)) {
      throw new Error("This account cannot be removed.");
    }

    // Remove all app access via RLS (no service role key needed): drop roles
    // and the profile so the account can no longer be used in the portal.
    const { error: roleErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.id);
    if (roleErr) throw new Error(roleErr.message);

    const { error: pErr } = await supabase.from("profiles").delete().eq("id", data.id);
    if (pErr) throw new Error(pErr.message);

    return { ok: true };
  });

// Approve a pending self-registered employee so their account becomes usable.
export const setEmployeeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), status: z.enum(["approved", "pending"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // RLS allows admins to update profiles — no service role key needed.
    const { error } = await supabase
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Assign the workflow departments (sales, project_manager, inventory,
// technician, accounts) for a user. Admin rights are managed separately.
export const setUserDepartments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        departments: z
          .array(z.enum(["sales", "project_manager", "inventory", "technician", "accounts"]))
          .max(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.id)
      .in("role", ["sales", "project_manager", "inventory", "technician", "accounts"]);
    if (delErr) throw new Error(delErr.message);

    if (data.departments.length > 0) {
      const { error } = await supabase
        .from("user_roles")
        .insert(data.departments.map((role) => ({ user_id: data.id, role })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
