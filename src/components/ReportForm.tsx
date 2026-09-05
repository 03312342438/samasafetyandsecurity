import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  LEFT_DEVICES,
  RIGHT_DEVICES,
  emptyReport,
  recordToForm,
  type ReportData,
  type ReportRecord,
  type DeviceStatus,
  type SparePart,
} from "@/lib/report-constants";
import { createReport, updateReport } from "@/lib/reports.functions";
import { buildSchedule, INTERVAL_UNITS } from "@/lib/maintenance-schedule";
import { emailReport } from "@/lib/email.functions";
import { elementToPdfBase64 } from "@/lib/generate-pdf";
import { ReportDocument } from "@/components/ReportDocument";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePad } from "@/components/SignaturePad";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CheckCircle2 } from "lucide-react";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function prettyScheduleDate(s: string) {
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ReportForm({
  defaultPerformedBy,
  onSaved,
  initial,
  onCancel,
}: {
  defaultPerformedBy?: string;
  onSaved?: () => void;
  initial?: ReportRecord;
  onCancel?: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<ReportData>(() =>
    initial
      ? recordToForm(initial)
      : { ...emptyReport(), performed_by: defaultPerformedBy ?? "" },
  );
  const [saving, setSaving] = useState(false);
  const [savedData, setSavedData] = useState<ReportData | null>(null);
  const save = useServerFn(createReport);
  const update = useServerFn(updateReport);
  const sendEmail = useServerFn(emailReport);
  const docRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const set = <K extends keyof ReportData>(k: K, v: ReportData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const schedulePreview = buildSchedule({
    baseDate: form.date_completed || form.report_date || new Date().toISOString().slice(0, 10),
    intervalValue: parseInt(form.maintenance_interval_value, 10) || 0,
    intervalUnit: form.maintenance_interval_unit || "months",
    count: parseInt(form.maintenance_count, 10) || 0,
  });

  const setDevice = (name: string, status: DeviceStatus) =>
    setForm((f) => ({ ...f, devices: { ...f.devices, [name]: status } }));

  const setSpare = (i: number, k: keyof SparePart, v: string) =>
    setForm((f) => {
      const parts = f.spare_parts.map((p, idx) => (idx === i ? { ...p, [k]: v } : p));
      if (k === "qty" || k === "unit_price") {
        const q = parseFloat(parts[i].qty);
        const u = parseFloat(parts[i].unit_price);
        if (!isNaN(q) && !isNaN(u)) parts[i].total = String(+(q * u).toFixed(2));
      }
      return { ...f, spare_parts: parts };
    });

  const addSpare = () =>
    setForm((f) => ({
      ...f,
      spare_parts: [...f.spare_parts, { spare_no: "", description: "", qty: "", unit_price: "", total: "" }],
    }));

  const removeSpare = (i: number) =>
    setForm((f) => ({ ...f, spare_parts: f.spare_parts.filter((_, idx) => idx !== i) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit && initial) {
        await update({ data: { ...form, id: initial.id } });
        qc.invalidateQueries({ queryKey: ["my-reports"] });
        qc.invalidateQueries({ queryKey: ["all-reports"] });
        toast.success("Report updated");
        onSaved?.();
      } else {
        await save({ data: form });
        // Generate the PDF while the offscreen document is still rendered.
        let pdfBase64 = "";
        if (docRef.current) {
          try {
            pdfBase64 = await elementToPdfBase64(docRef.current);
          } catch {
            /* ignore PDF errors; the report is still saved */
          }
        }
        setSavedData(form);
        qc.invalidateQueries({ queryKey: ["my-reports"] });
        qc.invalidateQueries({ queryKey: ["all-reports"] });
        toast.success("Report submitted");
        onSaved?.();
        if (pdfBase64) void emailToRecipients(form, pdfBase64);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save report");
    } finally {
      setSaving(false);
    }
  };

  const emailToRecipients = async (data: ReportData, pdfBase64: string) => {
    try {
      const label =
        (data.msr_no || data.client_name || "report")
          .replace(/[^a-z0-9-_ ]/gi, "")
          .trim() || "report";
      const res = await sendEmail({
        data: {
          pdf_base64: pdfBase64,
          file_name: `MSR_${label}.pdf`,
          client_name: data.client_name,
          client_email: data.client_email,
          msr_no: data.msr_no,
          project: data.project,
          performed_by: data.performed_by,
        },
      });
      if (res.sent) {
        toast.success(
          res.count > 0
            ? `Report emailed (copied to ${res.count} recipient${res.count === 1 ? "" : "s"})`
            : "Report emailed",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not email the report");
    }
  };



  if (savedData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-14 w-14 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">Report submitted successfully</h3>
            <p className="text-sm text-muted-foreground">
              Download the PDF or start a new report.
            </p>
          </div>
          <div className="flex gap-3">
            <ReportDownloadButton data={savedData} fileLabel={savedData.msr_no || savedData.client_name} />
            <Button
              variant="outline"
              onClick={() => {
                setSavedData(null);
                setForm({ ...emptyReport(), performed_by: defaultPerformedBy ?? "" });
              }}
            >
              New Report
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const inputDevices = [
    { head: "Devices", items: LEFT_DEVICES },
    { head: "Device", items: RIGHT_DEVICES },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Report Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Client Name">
            <Input value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </Field>
          <Field label="Client Email">
            <Input
              type="email"
              placeholder="client@example.com"
              value={form.client_email}
              onChange={(e) => set("client_email", e.target.value)}
            />
          </Field>
          <Field label="Contract">
            <Input value={form.contract} onChange={(e) => set("contract", e.target.value)} />
          </Field>
          <Field label="Order No.">
            <Input value={form.order_no} onChange={(e) => set("order_no", e.target.value)} />
          </Field>
          <Field label="Project">
            <Input value={form.project} onChange={(e) => set("project", e.target.value)} />
          </Field>
          <Field label="Site / Location">
            <Input value={form.site_location} onChange={(e) => set("site_location", e.target.value)} />
          </Field>
          <Field label="M.S.R No.">
            <Input value={form.msr_no} onChange={(e) => set("msr_no", e.target.value)} />
          </Field>
          <Field label="Our Ref No.">
            <Input value={form.our_ref_no} onChange={(e) => set("our_ref_no", e.target.value)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.report_date} onChange={(e) => set("report_date", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device Checklist</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {inputDevices.map((col) => (
            <div key={col.head} className="space-y-2">
              {col.items.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 rounded-md border p-2.5"
                >
                  <span className="text-sm font-medium">{name}</span>
                  <div className="flex shrink-0 gap-1">
                    {(["ok", "faulty"] as DeviceStatus[]).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={form.devices[name] === s ? (s === "ok" ? "default" : "destructive") : "outline"}
                        onClick={() => setDevice(name, s)}
                      >
                        {s === "ok" ? "OK" : "Faulty"}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spare Parts / Consumables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.spare_parts.map((p, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12">
              <Input className="sm:col-span-2" placeholder="Spare No." value={p.spare_no} onChange={(e) => setSpare(i, "spare_no", e.target.value)} />
              <Input className="sm:col-span-4" placeholder="Description" value={p.description} onChange={(e) => setSpare(i, "description", e.target.value)} />
              <Input className="sm:col-span-2" placeholder="Qty" value={p.qty} onChange={(e) => setSpare(i, "qty", e.target.value)} />
              <Input className="sm:col-span-2" placeholder="Unit Price" value={p.unit_price} onChange={(e) => setSpare(i, "unit_price", e.target.value)} />
              <div className="flex gap-2 sm:col-span-2">
                <Input placeholder="Total" value={p.total} onChange={(e) => setSpare(i, "total", e.target.value)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeSpare(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addSpare}>
            <Plus className="mr-1 h-4 w-4" /> Add Row
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action & Remarks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Action Taken">
            <Textarea rows={4} value={form.action_taken} onChange={(e) => set("action_taken", e.target.value)} />
          </Field>
          <Field label="Remarks">
            <Textarea rows={2} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next Maintenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Time between maintenances">
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  value={form.maintenance_interval_value}
                  onChange={(e) => set("maintenance_interval_value", e.target.value)}
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.maintenance_interval_unit}
                  onChange={(e) => set("maintenance_interval_unit", e.target.value)}
                >
                  {INTERVAL_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <Field label="No. of Maintenances">
              <Input
                type="number"
                min="0"
                placeholder="e.g. 4"
                value={form.maintenance_count}
                onChange={(e) => set("maintenance_count", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Input
              placeholder="e.g. Quarterly visits, coordinate with site team"
              value={form.next_maintenance}
              onChange={(e) => set("next_maintenance", e.target.value)}
            />
          </Field>
          {schedulePreview.length > 0 && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="mb-1 font-medium">Scheduled reminders ({schedulePreview.length}):</p>
              <p className="text-muted-foreground">
                {schedulePreview.map((s) => prettyScheduleDate(s.due_date)).join("  •  ")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>Sign Off</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="Performed by">
              <Input value={form.performed_by} onChange={(e) => set("performed_by", e.target.value)} />
            </Field>
            <SignaturePad
              label="Employee Signature"
              value={form.employee_signature}
              onChange={(v) => set("employee_signature", v)}
            />
          </div>
          <div className="space-y-4">
            <Field label="Client Name (signatory)">
              <Input value={form.client_sign_name} onChange={(e) => set("client_sign_name", e.target.value)} />
            </Field>
            <Field label="Designation">
              <Input value={form.client_designation} onChange={(e) => set("client_designation", e.target.value)} />
            </Field>
            <Field label="Date Completed">
              <Input type="date" value={form.date_completed} onChange={(e) => set("date_completed", e.target.value)} />
            </Field>
            <SignaturePad
              label="Client Signature"
              value={form.client_signature}
              onChange={(v) => set("client_signature", v)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        {isEdit && onCancel && (
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Save Changes" : "Submit Report"}
        </Button>
      </div>

      {/* Offscreen render target used to generate the PDF for emailing on submit. */}
      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        <ReportDocument ref={docRef} data={form} />
      </div>
    </form>
  );
}
