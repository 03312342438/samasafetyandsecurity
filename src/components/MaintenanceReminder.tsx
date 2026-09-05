import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyMaintenanceTasks } from "@/lib/maintenance.functions";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { Bell, CalendarClock } from "lucide-react";

const todayStr = () => new Date().toISOString().slice(0, 10);

// Play a short attention beep using the Web Audio API (no asset needed).
function playBeep() {
  try {
    const Ctx =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Two quick tones.
    [0, 0.18].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.16);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore audio failures */
  }
}

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MaintenanceReminder() {
  const fetchTasks = useServerFn(listMyMaintenanceTasks);
  const { data } = useQuery({
    queryKey: ["my-maintenance-tasks"],
    queryFn: () => fetchTasks(),
    // Re-check periodically so a due date that passes while the app is open
    // still triggers a reminder.
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const tasks = (data as any[]) ?? [];
  const today = todayStr();
  const due = tasks.filter(
    (t) => t.status === "pending" && t.due_date <= today,
  );
  const overdue = due.filter((t) => t.due_date < today);

  // Track which due tasks we have already alerted for today so we don't spam
  // the user on every refetch / navigation.
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (due.length === 0) return;
    const key = `maint-alert-${today}`;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      seen = [];
    }
    seen.forEach((id) => notified.current.add(id));

    const fresh = due.filter((t) => !notified.current.has(t.id));
    if (fresh.length === 0) return;

    fresh.forEach((t) => notified.current.add(t.id));
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(notified.current)));
    } catch {
      /* ignore */
    }

    // Sound.
    playBeep();

    // Toast pop-up inside the app.
    const first = fresh[0];
    const title =
      fresh.length === 1
        ? `Maintenance due: ${first.client_name || "Scheduled visit"}`
        : `${fresh.length} maintenances are due`;
    const body =
      fresh.length === 1
        ? `${first.project || first.site_location || "Visit"} #${first.sequence} — due ${fmtDate(first.due_date)}`
        : "Open the Maintenance tab to review the due visits.";
    toast.warning(title, { description: body, duration: 10000 });

    // Desktop notification (best-effort, needs permission).
    if (typeof Notification !== "undefined") {
      const show = () =>
        new Notification(title, { body, tag: "sama-maintenance" });
      if (Notification.permission === "granted") {
        show();
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          if (p === "granted") show();
        });
      }
    }
  }, [due.map((t) => t.id).join(","), today]);

  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative"
          aria-label="Maintenance reminders"
        >
          <Bell className="h-5 w-5" />
          {due.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {due.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" /> Maintenance Due
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {due.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No maintenance is due right now.
            </p>
          ) : (
            due.map((t) => (
              <div key={t.id} className="border-b px-4 py-3 last:border-b-0">
                <p className="text-sm font-medium">
                  {t.client_name || "Scheduled visit"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    #{t.sequence}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.site_location || t.project || "—"} · due {fmtDate(t.due_date)}
                </p>
                <span
                  className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-medium ${
                    t.due_date < today
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {t.due_date < today ? "Overdue" : "Due today"}
                </span>
              </div>
            ))
          )}
        </div>
        {overdue.length > 0 && (
          <div className="border-t bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
            {overdue.length} overdue
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
