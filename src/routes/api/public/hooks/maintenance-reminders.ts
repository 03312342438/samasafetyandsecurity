import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_NAME = "Sama Safety & Security";

function resolveFrom() {
  const raw = (process.env.RESEND_FROM_EMAIL || "").trim();
  const email = raw.match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/)?.[0];
  if (!email) {
    throw new Error("RESEND_FROM_EMAIL is not set to a valid sender address.");
  }
  return raw.includes("<") ? raw : `${FROM_NAME} <${email}>`;
}

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function prettyDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function buildHtml(opts: {
  variant: "soon" | "due";
  task: any;
  employeeName: string;
}) {
  const { variant, task, employeeName } = opts;
  const banner =
    variant === "soon"
      ? "This maintenance task is coming up in 2 days."
      : "This maintenance task is due today.";

  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${label}</td><td style="padding:4px 0;font-weight:600">${value}</td></tr>`
      : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:560px">
      <h2 style="margin:0 0 4px">Maintenance Reminder</h2>
      <p style="margin:0 0 16px;color:#475569">${banner}</p>
      <table style="border-collapse:collapse;font-size:14px">
        ${row("Client", task.client_name)}
        ${row("Project", task.project)}
        ${row("Site / Location", task.site_location)}
        ${row("Due date", prettyDate(task.due_date))}
        ${row("Maintenance no.", String(task.sequence))}
        ${row("Pending with", employeeName)}
      </table>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Sama Safety &amp; Security · www.samasafety.net</p>
    </div>`;
}

async function sendEmail(to: string[], subject: string, html: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured");

  // Self-hosted (Cloudflare) has no LOVABLE_API_KEY -> call Resend directly.
  const useGateway = Boolean(lovableKey);
  const url = useGateway
    ? `${GATEWAY_URL}/emails`
    : "https://api.resend.com/emails";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (useGateway) {
    headers.Authorization = `Bearer ${lovableKey}`;
    headers["X-Connection-Api-Key"] = resendKey;
  } else {
    headers.Authorization = `Bearer ${resendKey}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ from: resolveFrom(), to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    let reason = body;
    try {
      reason = (JSON.parse(body) as { message?: string }).message || body;
    } catch {
      /* keep raw body */
    }
    throw new Error(`Resend send failed (${res.status}): ${reason}`);
  }
}



export const Route = createFileRoute("/api/public/hooks/maintenance-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Recipient list (admin-managed).
        const { data: emailRows } = await supabaseAdmin
          .from("maintenance_reminder_emails")
          .select("email");
        const recipients = Array.from(
          new Set(
            (emailRows ?? [])
              .map((r: { email: string }) => (r.email ?? "").trim().toLowerCase())
              .filter(Boolean),
          ),
        );

        if (recipients.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, sent: 0, reason: "no_recipients" }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        const today = dateStr(new Date());
        const inTwoDays = dateStr(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));

        // 2-day-ahead reminders.
        const { data: soonTasks } = await supabaseAdmin
          .from("maintenance_tasks")
          .select("*")
          .eq("status", "pending")
          .eq("due_date", inTwoDays)
          .is("reminder_2day_sent_at", null);

        // Due-now reminders (includes any missed/overdue not yet notified).
        const { data: dueTasks } = await supabaseAdmin
          .from("maintenance_tasks")
          .select("*")
          .eq("status", "pending")
          .lte("due_date", today)
          .is("reminder_due_sent_at", null);

        const allTasks = [...(soonTasks ?? []), ...(dueTasks ?? [])];

        // Resolve responsible employee names.
        const ids = Array.from(new Set(allTasks.map((t: any) => t.created_by)));
        let nameById: Record<string, string> = {};
        if (ids.length) {
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, email")
            .in("id", ids);
          nameById = Object.fromEntries(
            (profiles ?? []).map((p: any) => [p.id, p.full_name || p.email || "—"]),
          );
        }

        let sent = 0;

        for (const task of soonTasks ?? []) {
          const employeeName = nameById[task.created_by] ?? "—";
          const subject = `Maintenance due in 2 days${task.client_name ? ` — ${task.client_name}` : ""}`;
          await sendEmail(recipients, subject, buildHtml({ variant: "soon", task, employeeName }));
          await supabaseAdmin
            .from("maintenance_tasks")
            .update({ reminder_2day_sent_at: new Date().toISOString() })
            .eq("id", task.id);
          sent++;
        }

        for (const task of dueTasks ?? []) {
          const employeeName = nameById[task.created_by] ?? "—";
          const subject = `Maintenance due today${task.client_name ? ` — ${task.client_name}` : ""}`;
          await sendEmail(recipients, subject, buildHtml({ variant: "due", task, employeeName }));
          await supabaseAdmin
            .from("maintenance_tasks")
            .update({ reminder_due_sent_at: new Date().toISOString() })
            .eq("id", task.id);
          sent++;
        }

        return new Response(JSON.stringify({ ok: true, sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
