import { forwardRef } from "react";
import { SAMA_LOGO_BASE64 } from "@/lib/logo";
import { LEFT_DEVICES, RIGHT_DEVICES, type ReportData } from "@/lib/report-constants";
import { intervalLabel } from "@/lib/maintenance-schedule";

const NAVY = "#103a52";
const BORDER = "1px solid #000000";

function fmtDate(d: string) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}/${parts[0]}`;
  return d;
}

const cell: React.CSSProperties = {
  border: BORDER,
  padding: "3px 6px",
  fontSize: 11,
  verticalAlign: "top",
  wordBreak: "break-word",
};
const labelCell: React.CSSProperties = { ...cell, fontWeight: 700, whiteSpace: "nowrap" };

type Props = { data: ReportData };

export const ReportDocument = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const total = data.spare_parts.reduce((sum, p) => {
    const n = parseFloat(p.total);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  const filledSpares = data.spare_parts.filter(
    (p) => p.spare_no || p.description || p.qty || p.unit_price || p.total
  );
  const spareRows = filledSpares.length ? filledSpares : [{ spare_no: "", description: "", qty: "", unit_price: "", total: "" }];

  const deviceMark = (name: string, faulty: boolean) => {
    const status = data.devices[name];
    if (faulty) return status === "faulty" ? "Yes" : "";
    return status === "ok" ? "Yes" : "";
  };

  return (
    <div
      ref={ref}
      style={{
        width: 794,
        background: "#ffffff",
        color: "#111111",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: 28,
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div
          style={{
            background: NAVY,
            color: "#ffffff",
            padding: "16px 22px",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 1,
            width: 360,
            textAlign: "center",
          }}
        >
          MAINTENANCE SERVICE REPORT
        </div>
        <img src={SAMA_LOGO_BASE64} alt="Sama Safety & Security" style={{ height: 64 }} />
      </div>

      {/* Info section */}
      <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "52%", tableLayout: "fixed" }}>
          <tbody>
            {[
              ["Client Name", data.client_name],
              ["Client Email", data.client_email],
              ["Contract", data.contract],
              ["Order No.", data.order_no],
              ["Project", data.project],
              ["Site/Location", data.site_location],
            ].map(([l, v]) => (
              <tr key={l}>
                <td style={{ ...labelCell, width: 110 }}>{l}</td>
                <td style={cell}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table style={{ borderCollapse: "collapse", width: "48%", tableLayout: "fixed", height: "fit-content" }}>
          <tbody>
            <tr>
              <td
                rowSpan={3}
                style={{ ...cell, width: 54, textAlign: "center", verticalAlign: "middle", fontSize: 30, fontWeight: 700 }}
              >
                M
              </td>
              <td style={{ ...labelCell, width: 90 }}>M.S.R No.</td>
              <td style={{ ...cell, textAlign: "center" }}>{data.msr_no}</td>
            </tr>
            <tr>
              <td style={labelCell}>Date</td>
              <td style={{ ...cell, textAlign: "center" }}>{fmtDate(data.report_date)}</td>
            </tr>
            <tr>
              <td style={labelCell}>Our Ref No.</td>
              <td style={{ ...cell, textAlign: "center" }}>{data.our_ref_no}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Devices section */}
      <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
        {[
          { head: "DEVICES", items: LEFT_DEVICES },
          { head: "DEVICE", items: RIGHT_DEVICES },
        ].map((col) => (
          <table key={col.head} style={{ borderCollapse: "collapse", width: "50%", tableLayout: "fixed" }}>
            <tbody>
              <tr>
                <td style={labelCell}>{col.head}</td>
                <td style={{ ...labelCell, width: 52, textAlign: "center" }}>OK</td>
                <td style={{ ...labelCell, width: 60, textAlign: "center" }}>FAULTY</td>
              </tr>
              {col.items.map((name) => (
                <tr key={name}>
                  <td style={{ ...cell, fontWeight: 700 }}>{name}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{deviceMark(name, false)}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{deviceMark(name, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {/* Spare parts */}
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ ...labelCell, width: 90 }}>Spare No.</td>
            <td style={{ ...labelCell, textAlign: "center" }}>Spare Parts/Consumables (if any)</td>
            <td style={{ ...labelCell, width: 70, textAlign: "center" }}>Qty</td>
            <td style={{ ...labelCell, width: 90, textAlign: "center" }}>Unit Price</td>
            <td style={{ ...labelCell, width: 90, textAlign: "center" }}>Total</td>
          </tr>
          {spareRows.map((p, i) => (
            <tr key={i}>
              <td style={{ ...cell, height: 20 }}>{p.spare_no}</td>
              <td style={cell}>{p.description}</td>
              <td style={{ ...cell, textAlign: "center" }}>{p.qty}</td>
              <td style={{ ...cell, textAlign: "right" }}>{p.unit_price}</td>
              <td style={{ ...cell, textAlign: "right" }}>{p.total}</td>
            </tr>
          ))}
          <tr>
            <td style={cell} />
            <td style={cell} />
            <td style={cell} />
            <td style={{ ...labelCell, textAlign: "center" }}>Total</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{total || 0}</td>
          </tr>
        </tbody>
      </table>

      {/* Next maintenance */}
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ ...labelCell, width: 170 }}>Maintenance Interval</td>
            <td style={cell}>
              {intervalLabel(data.maintenance_interval_value, data.maintenance_interval_unit)}
            </td>
            <td style={{ ...labelCell, width: 150 }}>No. of Maintenances</td>
            <td style={{ ...cell, width: 90, textAlign: "center" }}>{data.maintenance_count}</td>
          </tr>
          {data.next_maintenance ? (
            <tr>
              <td style={{ ...labelCell, width: 170 }}>Notes</td>
              <td style={cell} colSpan={3}>{data.next_maintenance}</td>
            </tr>
          ) : null}
        </tbody>
      </table>


      {/* Action taken */}
      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 0 }}>
        <tbody>
          <tr>
            <td style={labelCell}>Action Taken:</td>
          </tr>
          <tr>
            <td style={{ ...cell, height: 70, verticalAlign: "top" }}>{data.action_taken}</td>
          </tr>
        </tbody>
      </table>

      {/* Divider */}
      <div style={{ background: NAVY, height: 26 }} />

      {/* Sign off */}
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: "50%", height: 24 }}>Remarks:</td>
            <td style={{ ...labelCell, width: 120 }}>Client Signature:</td>
            <td style={{ ...cell, height: 56, textAlign: "center" }}>
              {data.client_signature && (
                <img src={data.client_signature} alt="client signature" style={{ maxHeight: 50, maxWidth: "100%" }} />
              )}
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, height: 24 }}>{data.remarks}</td>
            <td style={labelCell}>Name:</td>
            <td style={cell}>{data.client_sign_name}</td>
          </tr>
          <tr>
            <td style={cell}>
              <span style={{ fontWeight: 700 }}>Performed by: </span>
              {data.performed_by}
            </td>
            <td style={labelCell}>Designation:</td>
            <td style={cell}>{data.client_designation}</td>
          </tr>
          <tr>
            <td style={{ ...cell, height: 56 }}>
              <span style={{ fontWeight: 700 }}>Employee Signature:</span>
              <div style={{ textAlign: "center", marginTop: 2 }}>
                {data.employee_signature && (
                  <img src={data.employee_signature} alt="employee signature" style={{ maxHeight: 46, maxWidth: "70%" }} />
                )}
              </div>
            </td>
            <td style={labelCell}>Date Completed:</td>
            <td style={cell}>{fmtDate(data.date_completed)}</td>
          </tr>
        </tbody>
      </table>

      {/* Footer (preview only — PDF draws this on every page) */}
      <div
        data-pdf-footer="true"
        style={{
          background: NAVY,
          color: "#ffffff",
          textAlign: "center",
          fontSize: 10,
          padding: "10px 8px",
          lineHeight: 1.5,
        }}
      >
        Tel: 00973 17684492, FAX: 0097317684856, PO.BOX 75873 - Juffair, Kingdom of Bahrain.
        <br />
        CR.No. 67898-1; Email: sama@samasafety.net - www.samasafety.net
      </div>
    </div>
  );
});

ReportDocument.displayName = "ReportDocument";
