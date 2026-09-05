# SAMA Fire & Safety ERP — Integration Plan

## What already exists (audited, will be preserved)

| Existing | Role in new workflow |
|---|---|
| Auth + roles (`admin`, `employee`), approval of new sign-ups | Extended with more departments, not replaced |
| `reports` table + Report form, signature pad, PDF, Excel export | Becomes the **Service Report**, linked to Job Number |
| `maintenance_tasks` + reminder emails + cron hook | Becomes the Maintenance side of Job execution |
| Employee dashboard (my reports / my tasks) | Becomes the **Technician dashboard** |
| Admin console (employees, recipients, tasks, spare parts) | Becomes the **Management** console |
| Email sending, global search helper, shared header/tabs/badges | Extended, reused everywhere |

Nothing above is deleted or duplicated.

## What is missing and must be built

Customers, Assets, Inquiries, Quotations (with revisions), Purchase Orders + PO verification, Projects, Job Numbers, Drawings, BOM/BOS, Inventory + material issue/return/consumption, Daily Progress, Site Issues, Invoices, Payments, Project Costs, a single Approvals engine, Notifications, Audit trail, and role-based dashboards.

That is a large system. Building it in one shot would be unstable and unreviewable, so it ships in phases — each phase leaves a working app.

## Phases

**Phase 1 — Foundation (this phase)**
- Extend the role enum to: `admin` (management), `sales`, `project_manager`, `inventory`, `technician` (existing employees map here), `accounts`. Existing admin/employee rows are migrated, not dropped.
- One central `approvals` table (types A1–A6) + one `notifications` table + one `audit_log` table — reused by every later module.
- Core entities: `customers`, `assets`, `projects`, `job_numbers`, with `reports` and `maintenance_tasks` gaining optional `customer_id` / `project_id` / `job_number_id` links so existing rows stay valid.
- Role-aware navigation shell and a role router that sends each user to their dashboard. Technician dashboard = today's dashboard, unchanged in behaviour.

**Phase 2 — Sales chain**
Inquiry → Requirement Review → Quotation (with revision history) → Follow-ups → Customer Acceptance → Customer PO → PO Verification gate (match / clarification loop) → A1 & A2 management approvals. Sales dashboard.

**Phase 3 — Project Manager & Engineering**
Project planning, drawings with revision/status, BOM, BOS, Job Number creation with A3/A4 approval gates, task assignment. PM dashboard. Unified Project record page with tabs.

**Phase 4 — Inventory & material control**
Stock, reservation/allocation, Material Issue Notes bound to an approved Job Number + approved BOM (enforced in the database, not just the UI), returns, consumption, shortage reporting, A5 additional-material approval. Inventory dashboard.

**Phase 5 — Execution & Service**
Daily Progress, Site Issues, mobile-first job screens, and wiring the existing service report + customer signature into Job Number → PM review.

**Phase 6 — Accounts & Closure**
Invoices, payments, receivables, project costs by Job Number, profitability, A6 final review and the controlled Project Closure checklist. Accounts + Management dashboards, global search across all numbers, full audit timeline.

## Technical notes

- All new tables live in the existing backend with RLS, `GRANT`s and department-scoped policies driven by the existing `private.has_role` security-definer function (extended for new roles). Management sees everything; departments see their own scope.
- Approval gates and the material-issue rule are enforced with database triggers/policies so they cannot be bypassed from the UI.
- Server access continues to use `createServerFn` + `requireSupabaseAuth`, matching the current `src/lib/*.functions.ts` pattern.
- UI keeps the current shadcn/Tailwind design language, `AppHeader`, `SegmentedTabs`, and existing status-badge styling.
- Status values come from one shared master-lifecycle constant module so no module invents its own.

## Scope check

This plan starts with Phase 1 only. After it is running I'll continue phase by phase, each ending with a working, testable app, up to the full end-to-end scenario.
