import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUoms } from "@/lib/uom.functions";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Shared reader for the Project Manager's unit-of-measurement master list. */
export function useUoms() {
  const fetchUoms = useServerFn(listUoms);
  const { data } = useQuery({
    queryKey: ["uoms"],
    queryFn: () => fetchUoms(),
    staleTime: 5 * 60_000,
  });
  return ((data as any[]) ?? []).filter((u) => u.active !== false);
}

/**
 * The ONLY way a unit is chosen anywhere in the app — free text is not allowed
 * so every module speaks the same units.
 */
export function UomSelect({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  className?: string;
}) {
  const uoms = useUoms();
  const missing = value && !uoms.some((u) => u.code === value);

  const select = (
    <select
      className={cn(
        "h-9 w-full rounded-md border bg-background px-2 text-sm",
        label && "mt-1",
        className,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— unit —</option>
      {missing && <option value={value}>{value} (retired)</option>}
      {uoms.map((u) => (
        <option key={u.id} value={u.code}>
          {u.code}
          {u.name ? ` — ${u.name}` : ""}
        </option>
      ))}
    </select>
  );

  if (!label) return select;
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {select}
    </div>
  );
}
