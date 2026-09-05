// Pure helpers for computing the maintenance schedule from a report's
// interval (value + unit) and the number of maintenances. Safe to import
// anywhere (no server-only code).

export type IntervalUnit = "days" | "weeks" | "months" | "years";

export const INTERVAL_UNITS: { value: IntervalUnit; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

function addInterval(base: Date, value: number, unit: string, times: number): Date {
  const d = new Date(base.getTime());
  const amount = value * times;
  switch (unit) {
    case "days":
      d.setDate(d.getDate() + amount);
      break;
    case "weeks":
      d.setDate(d.getDate() + amount * 7);
      break;
    case "years":
      d.setFullYear(d.getFullYear() + amount);
      break;
    case "months":
    default:
      d.setMonth(d.getMonth() + amount);
      break;
  }
  return d;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build the list of scheduled maintenance due dates.
 * Returns an array of { sequence, due_date } objects.
 */
export function buildSchedule(opts: {
  baseDate: string; // YYYY-MM-DD
  intervalValue: number;
  intervalUnit: string;
  count: number;
}): { sequence: number; due_date: string }[] {
  const { baseDate, intervalValue, intervalUnit, count } = opts;
  if (!baseDate || !intervalValue || intervalValue <= 0 || !count || count <= 0) {
    return [];
  }
  const base = new Date(`${baseDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [];

  const out: { sequence: number; due_date: string }[] = [];
  for (let i = 1; i <= count; i++) {
    out.push({ sequence: i, due_date: toDateString(addInterval(base, intervalValue, intervalUnit, i)) });
  }
  return out;
}

export function intervalLabel(value: number | string, unit: string): string {
  const v = typeof value === "string" ? value : String(value);
  if (!v) return "—";
  const n = Number(v);
  const u = unit || "months";
  const singular = u.endsWith("s") ? u.slice(0, -1) : u;
  return `Every ${v} ${n === 1 ? singular : u}`;
}
