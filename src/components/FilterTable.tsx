import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  /** Raw value used for filtering / sorting. */
  value: (row: T) => string | number | null | undefined;
  /** Optional custom cell renderer. */
  cell?: (row: T) => React.ReactNode;
  className?: string;
};

const text = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/**
 * Excel-style data table: every column has its own filter (search + tick list)
 * and click-to-sort header.
 */
export function FilterTable<T extends { id?: string }>({
  columns,
  rows,
  empty = "Nothing here yet.",
  actions,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  actions?: (row: T) => React.ReactNode;
}) {
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const filtered = useMemo(() => {
    let out = rows.filter((row) =>
      columns.every((c) => {
        const picked = filters[c.key];
        if (!picked || picked.length === 0) return true;
        return picked.includes(text(c.value(row)));
      }),
    );
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = col.value(a);
          const bv = col.value(b);
          const na = Number(av);
          const nb = Number(bv);
          const cmp =
            Number.isFinite(na) && Number.isFinite(nb) && av !== "" && bv !== ""
              ? na - nb
              : text(av).localeCompare(text(bv));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, filters, sort]);

  const activeCount = Object.values(filters).filter((v) => v.length).length;

  return (
    <div className="space-y-2">
      {activeCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{activeCount} column filter(s) active</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setFilters({})}>
            <X className="mr-1 h-3 w-3" /> Clear all
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 text-left font-medium", c.className)}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() =>
                        setSort((s) =>
                          s?.key === c.key
                            ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" }
                            : { key: c.key, dir: "asc" },
                        )
                      }
                    >
                      {c.header}
                      {sort?.key === c.key &&
                        (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                    <ColumnFilter
                      values={[...new Set(rows.map((r) => text(c.value(r))))].sort((a, b) => a.localeCompare(b))}
                      selected={filters[c.key] ?? []}
                      onChange={(next) => setFilters((f) => ({ ...f, [c.key]: next }))}
                    />
                  </div>
                </th>
              ))}
              {actions && <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={(row.id as string) ?? i} className="border-t hover:bg-muted/30">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-2 align-top", c.className)}>
                    {c.cell ? c.cell(row) : text(c.value(row))}
                  </td>
                ))}
                {actions && <td className="px-3 py-2 text-right">{actions(row)}</td>}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-3 py-10 text-center text-muted-foreground">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnFilter({
  values, selected, onChange,
}: { values: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = values.filter((v) => v.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-6 w-6 p-0", selected.length && "text-primary")}
          aria-label="Filter column"
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search values…"
          className="h-8"
        />
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {shown.map((v) => {
            const on = selected.includes(v);
            return (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                <Checkbox
                  checked={on}
                  onCheckedChange={() =>
                    onChange(on ? selected.filter((x) => x !== v) : [...selected, v])
                  }
                />
                <span className="truncate">{v}</span>
              </label>
            );
          })}
          {shown.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No values.</p>}
        </div>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 h-7 w-full text-xs" onClick={() => onChange([])}>
            Clear filter
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
