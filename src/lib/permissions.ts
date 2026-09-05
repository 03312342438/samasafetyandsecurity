import { can, type Capability } from "@/lib/workflow";

type AnyClient = any;

/** Read the caller's department roles (server side). */
export async function myRoles(supabase: AnyClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}

export async function isManagement(supabase: AnyClient, userId: string): Promise<boolean> {
  return (await myRoles(supabase, userId)).includes("admin");
}

const MESSAGES: Partial<Record<Capability, string>> = {
  "report.fill": "Only Installation & Maintenance / Technician staff can submit service reports.",
  "customer.manage": "Only Sales and Management can create or change customer records.",
  "sales.manage": "Only the Sales department can manage inquiries, quotations and customer POs.",
  "project.create": "Only the Project Manager can create projects and project numbers.",
  "bom.create": "Only the Project Manager can create a BOM/BOS.",
  "jobnumber.create": "Only the Project Manager can create a job number.",
  "jobnumber.approve_pm": "Only the Project Manager can approve a job number.",
  "uom.manage": "Only the Project Manager can maintain the units of measurement.",
  "stock.item.create": "Only the Project Manager can add a new item code.",
  "stock.item.approve": "Only Management can approve an item code.",
  "stock.receive": "Only the Store can receive stock.",
  "stock.issue": "Only the Store can release material.",
  "accounts.manage": "Only the Accounts department can handle invoices and payments.",
  "invoice.create": "Invoices are raised by the Accounts department only.",
};

/** Throw unless the caller's department allows this action. */
export async function assertCan(
  supabase: AnyClient,
  userId: string,
  cap: Capability,
): Promise<string[]> {
  const roles = await myRoles(supabase, userId);
  if (!can(roles, cap)) {
    throw new Error(MESSAGES[cap] ?? "You do not have permission to do this.");
  }
  return roles;
}

/**
 * Once a record has been approved it is frozen: nobody may edit it any more,
 * and only Management may delete it.
 */
export async function assertMutable(
  supabase: AnyClient,
  userId: string,
  opts: { approved: boolean; label: string; action?: "edit" | "delete" },
): Promise<void> {
  if (!opts.approved) return;
  const action = opts.action ?? "edit";
  if (action === "delete" && (await isManagement(supabase, userId))) return;
  if (action === "edit") {
    throw new Error(`${opts.label} has been approved — it can no longer be edited.`);
  }
  throw new Error(`${opts.label} has been approved — only Management can delete it now.`);
}


/** True when a record's status means "approved / issued / verified". */
export function isApprovedStatus(...values: (string | null | undefined)[]): boolean {
  return values.some((v) =>
    ["approved", "verified", "issued", "paid", "partially_paid", "closed", "accepted"].includes(
      (v ?? "").toLowerCase(),
    ),
  );
}
