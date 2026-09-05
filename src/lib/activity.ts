// Shared audit-trail and notification helpers.
// These take an already-authenticated Supabase client (from a server function
// context) so they contain no secrets and are safe to import anywhere.

type AnyClient = any;

export type AuditEntry = {
  action: string;
  entity_table?: string;
  entity_id?: string | null;
  entity_label?: string;
  previous_value?: unknown;
  new_value?: unknown;
};

/** Append-only activity log. Never throws — logging must not break a write. */
export async function logActivity(
  supabase: AnyClient,
  userId: string,
  entry: AuditEntry,
): Promise<void> {
  try {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    await supabase.from("audit_log").insert({
      user_id: userId,
      user_name: profile?.full_name ?? "",
      department: (roles ?? []).map((r: any) => r.role).join(", "),
      action: entry.action,
      entity_table: entry.entity_table ?? "",
      entity_id: entry.entity_id ?? null,
      entity_label: entry.entity_label ?? "",
      previous_value: entry.previous_value ?? null,
      new_value: entry.new_value ?? null,
    });
  } catch {
    /* never block the caller */
  }
}

export type NotificationInput = {
  title: string;
  message?: string;
  category?: string;
  link?: string;
  entity_table?: string;
  entity_id?: string | null;
};

/** Notify explicit users. */
export async function notifyUsers(
  supabase: AnyClient,
  userIds: string[],
  input: NotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await supabase.from("notifications").insert(
      unique.map((user_id) => ({
        user_id,
        title: input.title,
        message: input.message ?? "",
        category: input.category ?? "general",
        link: input.link ?? "",
        entity_table: input.entity_table ?? "",
        entity_id: input.entity_id ?? null,
      })),
    );
  } catch {
    /* never block the caller */
  }
}

/** Notify everyone holding one of the given departments/roles. */
export async function notifyDepartments(
  supabase: AnyClient,
  departments: string[],
  input: NotificationInput,
): Promise<void> {
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", departments);
    await notifyUsers(supabase, (data ?? []).map((r: any) => r.user_id), input);
  } catch {
    /* never block the caller */
  }
}
