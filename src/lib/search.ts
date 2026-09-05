// Lightweight client-side text matcher used by the History and Maintenance
// search boxes. Matches the query (case-insensitive) against any of the
// provided fields on the record.
export function matchesQuery(
  record: Record<string, any>,
  fields: string[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => {
    const v = record?.[f];
    if (v == null) return false;
    return String(v).toLowerCase().includes(q);
  });
}

// Fields searchable on a report record (History / All Reports).
export const REPORT_SEARCH_FIELDS = [
  "client_name",
  "contract",
  "order_no",
  "project",
  "site_location",
  "msr_no",
  "report_date",
  "our_ref_no",
];

// Fields searchable on a maintenance task (enriched with report fields server-side).
export const TASK_SEARCH_FIELDS = [
  "client_name",
  "contract",
  "order_no",
  "project",
  "site_location",
  "msr_no",
  "our_ref_no",
  "report_date",
  "due_date",
];
