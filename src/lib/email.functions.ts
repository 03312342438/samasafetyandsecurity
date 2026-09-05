import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const FROM_NAME = "Sama Safety & Security";

function resolveFrom() {
  const raw = (process.env.RESEND_FROM_EMAIL || "").trim();
  // Defensive: a user may paste an API key by mistake.
  const email = raw.match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/)?.[0];
  if (!email) {
    throw new Error(
      "RESEND_FROM_EMAIL is not set to a valid sender address on your verified domain.",
    );
  }
  // Allow either a bare address or already-formatted "Name <email>".
  return raw.includes("<") ? raw : `${FROM_NAME} <${email}>`;
}

const emailSchema = z.object({
  pdf_base64: z.string().max(12_000_000).default(""),
  file_name: z.string().max(200).default(""),
  client_name: z.string().max(300).default(""),
  client_email: z.string().max(320).default(""),
  msr_no: z.string().max(100).default(""),
  project: z.string().max(500).default(""),
  performed_by: z.string().max(200).default(""),
});

export const emailReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => emailSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: recipients, error } = await supabase
      .from("report_recipients")
      .select("email");
    if (error) throw new Error(error.message);

    const emails = (recipients ?? []).map((r: { email: string }) => r.email);
    const clientEmail = data.client_email.trim();
    if (clientEmail) emails.push(clientEmail);

    // De-duplicate (case-insensitive) and drop empties.
    const seen = new Set<string>();
    const to = emails.filter((e) => {
      const v = (e ?? "").trim().toLowerCase();
      if (!v || seen.has(v)) return false;
      seen.add(v);
      return true;
    });

    if (to.length === 0) {
      return { sent: false, count: 0, reason: "no_recipients" };
    }

    const lovableKey = process.env.LOVABLE_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY is not configured");
    // On self-hosted (e.g. Cloudflare) there is no LOVABLE_API_KEY, so we call
    // the Resend API directly. The Lovable connector gateway is only used when
    // running inside Lovable (where LOVABLE_API_KEY is provisioned).
    const useGateway = Boolean(lovableKey);

    const subject = data.msr_no
      ? `Maintenance Service Report — MSR ${data.msr_no}`
      : "Maintenance Service Report";

    const row = (label: string, value: string) =>
      value ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${label}</td><td style="padding:4px 0;font-weight:600">${value}</td></tr>` : "";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:560px">
        <h2 style="margin:0 0 4px">Maintenance Service Report</h2>
        <p style="margin:0 0 16px;color:#475569">A new maintenance service report has been submitted.</p>
        <table style="border-collapse:collapse;font-size:14px">
          ${row("Client", data.client_name)}
          ${row("Project", data.project)}
          ${row("M.S.R No.", data.msr_no)}
          ${row("Performed by", data.performed_by)}
          ${row("Client email", clientEmail)}
        </table>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Sama Safety &amp; Security · www.samasafety.net</p>
      </div>`;

    const body: Record<string, unknown> = {
      from: resolveFrom(),
      to,
      subject,
      html,
    };
    if (clientEmail) body.reply_to = clientEmail;
    if (data.pdf_base64) {
      body.attachments = [
        {
          filename: data.file_name || `report-${data.msr_no || "report"}.pdf`,
          content: data.pdf_base64,
        },
      ];
    }

    const url = useGateway
      ? `${GATEWAY_URL}/emails`
      : "https://api.resend.com/emails";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (useGateway) {
      headers.Authorization = `Bearer ${lovableKey}`;
      headers["X-Connection-Api-Key"] = resendKey;
    } else {
      headers.Authorization = `Bearer ${resendKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(formatResendError(res.status, text));
    }

    return { sent: true, count: to.length };
  });

function formatResendError(status: number, body: string) {
  let reason = body;
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    reason = parsed.message || parsed.error || body;
  } catch {
    /* keep raw body */
  }
  return `Resend send failed (${status}): ${reason}`;
}
