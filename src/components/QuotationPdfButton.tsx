import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadElementAsPdf } from "@/lib/generate-pdf";
import { SAMA_LOGO_BASE64 } from "@/lib/logo";
import { CURRENCY } from "@/lib/workflow";

const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** Generates the official SAMA quotation PDF for one quotation record. */
export function QuotationPdfButton({ quotation, customerName }: { quotation: any; customerName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const name = (quotation.reference || "quotation").replace(/[^a-z0-9-_ ]/gi, "").trim();
      await downloadElementAsPdf(ref.current, `${name}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error("Could not generate the quotation PDF");
    } finally {
      setBusy(false);
    }
  };

  const items = ((quotation.quotation_items ?? []) as any[]).slice().sort((a, b) => a.sequence - b.sequence);
  const cur = quotation.currency || CURRENCY;

  return (
    <>
      <Button variant="outline" size="sm" onClick={handle} disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
        Generate PDF
      </Button>

      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        <div
          ref={ref}
          style={{
            width: 794,
            padding: 40,
            background: "#ffffff",
            color: "#0f172a",
            fontFamily: "Helvetica, Arial, sans-serif",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #103a52", paddingBottom: 12 }}>
            <img src={SAMA_LOGO_BASE64} alt="Sama Safety & Security" style={{ height: 70 }} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#103a52" }}>QUOTATION</div>
              <div style={{ marginTop: 4 }}>{quotation.reference}{quotation.revision ? ` · Rev ${quotation.revision}` : ""}</div>
              <div>{new Date(quotation.created_at ?? Date.now()).toLocaleDateString()}</div>
            </div>
          </div>

          <table style={{ width: "100%", marginTop: 18, borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "50%", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700, color: "#103a52" }}>To</div>
                  <div>{customerName || quotation.customers?.name || "—"}</div>
                  <div>{quotation.site_location || ""}</div>
                </td>
                <td style={{ width: "50%", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700, color: "#103a52" }}>Subject</div>
                  <div>{quotation.title || "Fire &amp; safety works"}</div>
                  <div>Validity: {quotation.validity_days ?? 30} days</div>
                </td>
              </tr>
            </tbody>
          </table>

          {items.length > 0 && (
            <table style={{ width: "100%", marginTop: 18, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#103a52", color: "#ffffff" }}>
                  <th style={th}>S.No</th>
                  <th style={{ ...th, textAlign: "left" }}>Description</th>
                  <th style={th}>UOM</th>
                  <th style={th}>Qty</th>
                  <th style={th}>Unit price</th>
                  <th style={th}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id ?? i}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, textAlign: "left" }}>{it.description}</td>
                    <td style={td}>{it.unit}</td>
                    <td style={td}>{it.quantity}</td>
                    <td style={td}>{money(it.unit_price)}</td>
                    <td style={td}>{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <table style={{ marginTop: 18, marginLeft: "auto", borderCollapse: "collapse", minWidth: 300 }}>
            <tbody>
              <Row label="Material cost" value={`${cur} ${money(quotation.material_cost)}`} />
              <Row label="Labour cost" value={`${cur} ${money(quotation.labour_cost)}`} />
              <Row label={`Inland (${Number(quotation.inland_percent ?? 0)}%)`} value={`${cur} ${money(quotation.inland_cost)}`} />
              <Row label="Transport" value={`${cur} ${money(quotation.transport_cost)}`} />
              <Row label={`Gross margin (${Number(quotation.margin_percent ?? 0)}%)`} value="" />
              <Row label="Subtotal" value={`${cur} ${money(quotation.subtotal)}`} />
              <Row label={`VAT (${Number(quotation.vat_percent ?? 0)}%)`} value={`${cur} ${money(Number(quotation.total_amount ?? 0) - Math.max(Number(quotation.subtotal ?? 0) - Number(quotation.discount_amount ?? 0), 0))}`} />
              <tr>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, background: "#e2e8f0" }}>Total price</td>
                <td style={{ ...td, fontWeight: 700, background: "#e2e8f0" }}>{cur} {money(quotation.total_amount)}</td>
              </tr>
            </tbody>
          </table>

          {(quotation.scope_notes || quotation.payment_terms || quotation.delivery_terms) && (
            <div style={{ marginTop: 20, fontSize: 11 }}>
              {quotation.scope_notes && <p><strong>Scope:</strong> {quotation.scope_notes}</p>}
              {quotation.payment_terms && <p><strong>Payment terms:</strong> {quotation.payment_terms}</p>}
              {quotation.delivery_terms && <p><strong>Delivery terms:</strong> {quotation.delivery_terms}</p>}
            </div>
          )}

          <div style={{ marginTop: 40, fontSize: 11 }}>
            <p>For Sama Safety &amp; Security</p>
            <div style={{ marginTop: 40, borderTop: "1px solid #94a3b8", width: 200 }} />
            <p>Authorised signature</p>
          </div>
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = { border: "1px solid #103a52", padding: "6px 8px", fontSize: 11, textAlign: "center" };
const td: React.CSSProperties = { border: "1px solid #cbd5e1", padding: "6px 8px", fontSize: 11, textAlign: "center" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ ...td, textAlign: "left" }}>{label}</td>
      <td style={td}>{value}</td>
    </tr>
  );
}
