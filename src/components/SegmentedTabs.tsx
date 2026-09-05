import { cn } from "@/lib/utils";

type Tab = { value: string; label: React.ReactNode };

export function SegmentedTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Tab[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === t.value
              ? "bg-card text-foreground shadow-sm"
              : "hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
