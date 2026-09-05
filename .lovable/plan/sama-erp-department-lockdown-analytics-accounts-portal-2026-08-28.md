# SAMA ERP — Department Lockdown, Analytics & Accounts Portal

This extends the existing modules. Nothing is rebuilt and no data is removed.

## Phase 1 — Roles, permissions and currency (foundation)

- Sign-up designation list reduced to exactly: Sales, Project Manager, Inventory/Store, Installation & Maintenance, Accounts, Technician. Designation maps to the matching department role.
- Currency default changes from SAR to BHD everywhere (projects, quotations, BOM, invoices, dashboards).
- Maintenance report form visible only to Technician and Installation & Maintenance. Hidden for everyone else including Management.
- Ownership rules enforced in both UI and server functions:
  - Projects & project numbers: created only by Project Manager, approved by Management. No one else can create.
  - BOM/BOS: created only by Project Manager, approved by Management.
  - Job numbers: created by Installation & Maintenance → approved by Project Manager → then Management.
  - New inventory items: created only by Project Manager, approved by Management.
  - Invoices, payments, outstanding, overdue: Accounts only (Management read-only).
  - Sales has no Site/execution section; Sales approvals limited to Quotation and PO, each request carrying its quotation number / PO number. Once approved, Sales can no longer edit or delete that record.
  - Inventory/Store limited to: feed items (with supplier, price, qty per item code), search items, release items against a job number, and raise item requirement requests to the Project Manager (who then escalates to Management).
- Customer number added to customers and carried through project, quotation and PO for tracking.

## Phase 2 — Job number detail capture

Job number creation asks:
- Installation or Maintenance?
- Maintenance → which project + maintenance interval.
- Installation → list of installation steps, each with an expected completion date (and completion tracking).
- Linked BOM/BOS reference is required.

## Phase 3 — Management analytics

New charts on the Management dashboard (recharts):
- Pie — current month project counts: quotation sent, in installation/maintenance, completed.
- Pie — current month values for the same three buckets.
- Clustered columns — last 12 months: quotations submitted vs projects completed (counts).
- Clustered columns — last 12 months: quotation value, completed project value, gross margin.
- Project list with progress bar, total project value and payment received per project.
All figures derived automatically from the sales/project/invoice data already captured.

The two pie charts and the two clustered column charts also appear in the Sales portal, scoped to sales data.

## Phase 4 — Accounts portal (extends existing Accounts module)

Dashboard KPIs: revenue, invoiced, paid, outstanding receivables, overdue, payables, project cost, profit & margin, cash flow, pending approvals, ready for billing.

Modules added or extended:
- Customer accounts (balances, invoices, payments, outstanding)
- Ready for billing (triggered by approved projects, milestones, completed service reports)
- Invoices (draft → approve → issue → payment → PDF), always linked Customer → PO → Project → Job Number
- Customer payments with automatic balance updates
- Receivables aging: current, 1–30, 31–60, 61–90, 91–120, 120+
- Suppliers & payables
- Project costing (material cost auto-fed from Inventory; labour, subcontract, other expenses booked to the job number)
- Budget vs actual, project profitability and margin
- Cash flow
- Credit/debit notes and adjustments linked to original invoices
- Reports: revenue, receivables, payables, aging, invoices, payments, project cost, profitability, cash flow

Controls: no deletion of posted financial transactions (cancel/reverse only), users cannot approve their own transactions, full audit history retained, Management sees everything.

Management approval required for supplier payments, credit/debit notes, refunds, write-offs, invoice exceptions, non-budgeted expenses and financial adjustments. Normal invoices against an approved PO and approved billing milestone post without extra approval.

## Technical notes

- New tables: suppliers, supplier_invoices, supplier_payments, project_costs, credit_notes, job_installation_steps; new columns on customers (customer_number), job_numbers (job_kind, maintenance_interval, bom_id), stock_items (supplier/price history via stock_receipts).
- Role gating uses the existing `user_roles` + `has_role` pattern; every rule is enforced in the server function, not only hidden in the UI.
- Charts use `recharts` (already available through shadcn chart components).
- Delivered phase by phase so the app stays working throughout.
