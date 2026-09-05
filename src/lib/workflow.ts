// ============================================================================
// SAMA master workflow reference.
// ONE source of truth for departments, lifecycle stages, statuses and badges.
// Every module must use these constants instead of inventing its own strings.
// ============================================================================

export type Department =
  | "admin"
  | "sales"
  | "project_manager"
  | "inventory"
  | "technician"
  | "accounts"
  | "employee";

export const DEPARTMENTS: { value: Department; label: string; description: string }[] = [
  { value: "admin", label: "Management", description: "Full visibility and approval authority" },
  { value: "sales", label: "Sales", description: "Inquiries, quotations, customer POs" },
  { value: "project_manager", label: "Project Manager", description: "Planning, BOM/BOS, job numbers" },
  { value: "inventory", label: "Inventory / Store", description: "Stock, reservations, material issue" },
  { value: "technician", label: "Installation & Maintenance", description: "Site work, reports, daily progress" },
  { value: "accounts", label: "Accounts", description: "Invoices, payments, project costs" },
];

/** Company currency. Everything is quoted, costed and billed in BHD. */
export const CURRENCY = "BHD";

// Job designations offered at sign-up. Each maps to exactly one department.
export const DESIGNATIONS: { value: string; department: Department }[] = [
  { value: "Sales", department: "sales" },
  { value: "Project Manager", department: "project_manager" },
  { value: "Inventory/Store", department: "inventory" },
  { value: "Installation & Maintenance", department: "technician" },
  { value: "Accounts", department: "accounts" },
  { value: "Technician", department: "technician" },
];

export function departmentForDesignation(designation: string): Department {
  return DESIGNATIONS.find((d) => d.value === designation)?.department ?? "employee";
}


export const DEPARTMENT_LABELS: Record<string, string> = {
  admin: "Management",
  sales: "Sales",
  project_manager: "Project Manager",
  inventory: "Inventory",
  technician: "Technician",
  accounts: "Accounts",
  employee: "Technician",
};

/** Legacy "employee" accounts are technicians in the unified workflow. */
export function normalizeRoles(roles: string[] | undefined): Department[] {
  const set = new Set<Department>();
  (roles ?? []).forEach((r) => {
    if (r === "employee") set.add("technician");
    set.add(r as Department);
  });
  return [...set];
}

export function hasDept(roles: string[] | undefined, dept: Department): boolean {
  return normalizeRoles(roles).includes(dept);
}

/**
 * Store-only account: has the inventory department and no other real department.
 * The legacy "employee" role is ignored here — it is granted to every sign-up
 * and would otherwise make a store keeper look like a technician.
 */
export function isStoreOnly(roles: string[] | undefined, isAdmin?: boolean): boolean {
  const real = (roles ?? []).filter((r) => r !== "employee");
  return !isAdmin && real.includes("inventory") && real.every((r) => r === "inventory");
}

/**
 * Sales-only account: has the sales department and no other real department.
 * The legacy "employee" role is ignored — it is granted to every sign-up and
 * would otherwise make a sales person look like a technician.
 */
export function isSalesOnly(roles: string[] | undefined, isAdmin?: boolean): boolean {
  const real = (roles ?? []).filter((r) => r !== "employee");
  return !isAdmin && real.includes("sales") && real.every((r) => r === "sales");
}

// --------------------------------------------------------------------------
// Master lifecycle — the single controlled status list (section 22).
// --------------------------------------------------------------------------
export const LIFECYCLE_STAGES = [
  "inquiry",
  "requirement_review",
  "quotation_draft",
  "technical_review",
  "quotation_approval",
  "quotation_sent",
  "follow_up",
  "negotiation",
  "customer_accepted",
  "po_received",
  "po_verification",
  "clarification_required",
  "project_approval",
  "project_initiated",
  "project_planning",
  "bom_bos_preparation",
  "bom_bos_approval",
  "job_number_created",
  "job_number_approval",
  "material_planning",
  "material_allocation",
  "material_issued",
  "in_progress",
  "service_report",
  "customer_confirmation",
  "pm_review",
  "billing",
  "payment",
  "final_review",
  "closed",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  inquiry: "Inquiry",
  requirement_review: "Requirement Review",
  quotation_draft: "Quotation Draft",
  technical_review: "Technical Review",
  quotation_approval: "Quotation Approval",
  quotation_sent: "Quotation Sent",
  follow_up: "Follow-up",
  negotiation: "Negotiation / Revision",
  customer_accepted: "Customer Accepted",
  po_received: "Customer PO Received",
  po_verification: "PO Verification",
  clarification_required: "Clarification Required",
  project_approval: "Management Project Approval",
  project_initiated: "Project Initiated",
  project_planning: "Project Planning",
  bom_bos_preparation: "BOM/BOS Preparation",
  bom_bos_approval: "BOM/BOS Approval",
  job_number_created: "Job Number Created",
  job_number_approval: "Job Number Approval",
  material_planning: "Material Planning",
  material_allocation: "Material Allocation",
  material_issued: "Material Issued",
  in_progress: "Installation / Maintenance In Progress",
  service_report: "Service Report",
  customer_confirmation: "Customer Confirmation",
  pm_review: "Project Manager Review",
  billing: "Billing",
  payment: "Payment",
  final_review: "Final Management Review",
  closed: "Project Closure",
};

// --------------------------------------------------------------------------
// Approval gates A1 - A6 (section 6).
// --------------------------------------------------------------------------
export const APPROVAL_TYPES = {
  A1: "quotation_commercial",
  A2: "project_initiation",
  A3: "bom_bos",
  A4: "job_number",
  A5: "additional_material",
  A6: "final_review",
} as const;

export const APPROVAL_TYPE_LABELS: Record<string, string> = {
  quotation_commercial: "A1 — Quotation / Commercial Exception",
  project_initiation: "A2 — Customer Order / Project Initiation",
  bom_bos: "A3 — BOM / BOS",
  job_number: "A4 — Job Number",
  additional_material: "A5 — Additional Material / Cost",
  final_review: "A6 — Final Project / Commercial Review",
  customer_po: "Purchase Order approval",
  commercial_review: "Commercial review",
  item_code: "Item code approval",
  stock_lot: "Restock lot approval",
};

/** Fixed store categories — the only categories an item may be filed under. */
export const STOCK_CATEGORIES = [
  "Consumables",
  "Mechanical",
  "Electrical",
  "Electronics",
  "PPE & Safety",
  "Fire Fighting Equipment",
  "Fire Alarm & Detection",
  "Tools & Equipment",
  "Installation Materials",
  "Spare Parts",
  "Chemicals",
  "Others",
] as const;


export type ApprovalDecision = "pending" | "approved" | "rejected" | "revision_requested";

export const DECISION_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  revision_requested: "Revision Requested",
};

// --------------------------------------------------------------------------
// Shared status badge styling (semantic tokens only).
// --------------------------------------------------------------------------
export function statusBadgeClass(status: string): string {
  const s = (status ?? "").toLowerCase();
  if (["approved", "completed", "closed", "active", "paid", "verified", "ok"].includes(s))
    return "bg-primary/10 text-primary ring-1 ring-primary/20";
  if (["rejected", "clarification_required", "overdue", "shortage", "faulty"].includes(s))
    return "bg-destructive/10 text-destructive ring-1 ring-destructive/20";
  if (["pending", "revision_requested", "draft", "on_hold"].includes(s))
    return "bg-muted text-muted-foreground ring-1 ring-border";
  return "bg-accent/60 text-accent-foreground ring-1 ring-border";
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return (
    STAGE_LABELS[value] ??
    DECISION_LABELS[value] ??
    value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// --------------------------------------------------------------------------
// Department capability matrix — the single source of truth for "who can do
// what". Mirrored server-side by `assertCan` in permissions.ts.
// --------------------------------------------------------------------------
export type Capability =
  | "report.fill"          // maintenance service report form
  | "customer.manage"
  | "sales.manage"         // inquiries, quotations, customer POs
  | "project.create"       // projects & project numbers
  | "bom.create"
  | "jobnumber.create"
  | "jobnumber.approve_pm"
  | "uom.manage"           // units of measurement master list
  | "stock.item.create"    // add a brand-new item code
  | "stock.item.approve"   // Project Manager clears an item code for use
  | "stock.receive"        // feed quantity with supplier + price
  | "stock.issue"          // release against a job number
  | "material.request"
  | "site.execution"
  | "accounts.manage"      // invoices, payments, receivables, payables
  | "invoice.create"       // raising an invoice — Accounts only
  | "management.analytics";

const MATRIX: Record<Capability, Department[]> = {
  "report.fill": ["technician"],
  "customer.manage": ["sales"],
  "sales.manage": ["sales"],
  "project.create": ["project_manager", "sales"],
  "bom.create": ["project_manager", "sales"],
  "jobnumber.create": ["project_manager"],
  "jobnumber.approve_pm": ["project_manager"],
  "uom.manage": ["project_manager"],
  "stock.item.create": ["project_manager"],
  "stock.item.approve": ["admin"],
  "stock.receive": ["inventory"],
  "stock.issue": ["inventory"],
  "material.request": ["inventory", "project_manager"],
  "site.execution": ["technician", "project_manager"],
  "accounts.manage": ["accounts"],
  "invoice.create": ["accounts"],
  "management.analytics": ["admin"],
};

/**
 * Capabilities Management deliberately does NOT inherit — Management reviews
 * and approves this work rather than performing it.
 */
const ADMIN_EXCLUDED: Capability[] = ["report.fill", "invoice.create", "stock.item.create", "jobnumber.create"];

/** Management sees everything, but only these departments may act. */
export function can(roles: string[] | undefined, cap: Capability): boolean {
  const mine = normalizeRoles(roles);
  if (mine.includes("admin") && !ADMIN_EXCLUDED.includes(cap)) return true;
  return MATRIX[cap].some((d) => mine.includes(d));
}

/** Read-only visibility: management always, plus anyone who can act. */
export function canView(roles: string[] | undefined, cap: Capability): boolean {
  if (normalizeRoles(roles).includes("admin")) return true;
  return can(roles, cap);
}

