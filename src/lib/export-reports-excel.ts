import type { ReportRecord } from "./report-constants";

const NAVY = "FF103A52";
const NAVY_LIGHT = "FFE7EEF2";

function fmtDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const COLUMNS: { header: string; width: number; value: (r: ReportRecord) => string }[] = [
  { header: "M.S.R No.", width: 16, value: (r) => r.msr_no ?? "" },
  { header: "Order No.", width: 16, value: (r) => r.order_no ?? "" },
  { header: "Client Name", width: 26, value: (r) => r.client_name ?? "" },
  { header: "Date", width: 16, value: (r) => fmtDate(r.report_date) },
  { header: "Contract", width: 20, value: (r) => r.contract ?? "" },
  { header: "Project", width: 26, value: (r) => r.project ?? "" },
  { header: "Site/Location", width: 26, value: (r) => r.site_location ?? "" },
  { header: "Performed by", width: 22, value: (r) => r.performed_by ?? "" },
  { header: "Date Completed", width: 18, value: (r) => fmtDate(r.date_completed) },
];

export async function downloadReportsExcel(reports: ReportRecord[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sama Safety & Security";
  wb.created = new Date();
  const ws = wb.addWorksheet("Reports", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  // Title row
  const lastCol = COLUMNS.length;
  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "Sama Safety & Security — Maintenance Service Reports";
  titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 28;

  // Subtitle row
  ws.mergeCells(2, 1, 2, lastCol);
  const subCell = ws.getCell(2, 1);
  subCell.value = `${reports.length} report${reports.length === 1 ? "" : "s"} · Exported ${fmtDate(new Date().toISOString())}`;
  subCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF5B6B73" } };
  subCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 18;

  // Header row
  const headerRow = ws.getRow(3);
  COLUMNS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFFFFFFF" } },
      bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
      left: { style: "thin", color: { argb: "FFFFFFFF" } },
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
  });
  headerRow.height = 24;

  // Data rows
  reports.forEach((r, idx) => {
    const row = ws.addRow(COLUMNS.map((c) => c.value(r)));
    row.height = 20;
    row.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: idx % 2 === 0 ? "FFFFFFFF" : NAVY_LIGHT },
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD3DDE2" } },
        right: { style: "thin", color: { argb: "FFEAF0F3" } },
      };
    });
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sama-reports-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
