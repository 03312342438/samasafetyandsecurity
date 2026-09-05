export const LEFT_DEVICES = [
  "Control Equipment",
  "Sounder Monitoring",
  "Line Monitoring",
  "Indicators",
  "Controls",
  "Fire Brigade Signaling",
] as const;

export const RIGHT_DEVICES = [
  "Power supply",
  "Battery Volage (Qulescent)",
  "Battery Volage (Alarm)",
  "Charging Current",
  "Battery Monitoring",
  "Charger Monitoring",
] as const;

export const ALL_DEVICES = [...LEFT_DEVICES, ...RIGHT_DEVICES];

export type DeviceStatus = "ok" | "faulty";

export type SparePart = {
  spare_no: string;
  description: string;
  qty: string;
  unit_price: string;
  total: string;
};

export type ReportData = {
  client_name: string;
  client_email: string;
  contract: string;
  order_no: string;
  project: string;
  site_location: string;
  msr_no: string;
  our_ref_no: string;
  report_date: string;
  devices: Record<string, DeviceStatus>;
  spare_parts: SparePart[];
  action_taken: string;
  remarks: string;
  next_maintenance: string;
  maintenance_count: string;
  maintenance_interval_value: string;
  maintenance_interval_unit: string;
  performed_by: string;
  employee_signature: string;
  client_signature: string;
  client_sign_name: string;
  client_designation: string;
  date_completed: string;
};

export type ReportRecord = ReportData & {
  id: string;
  created_by: string;
  created_at: string;
};

export function recordToForm(r: ReportRecord): ReportData {
  return {
    client_name: r.client_name ?? "",
    client_email: r.client_email ?? "",
    contract: r.contract ?? "",
    order_no: r.order_no ?? "",
    project: r.project ?? "",
    site_location: r.site_location ?? "",
    msr_no: r.msr_no ?? "",
    our_ref_no: r.our_ref_no ?? "",
    report_date: r.report_date ?? "",
    devices: r.devices ?? {},
    spare_parts:
      r.spare_parts && r.spare_parts.length
        ? r.spare_parts
        : [{ spare_no: "", description: "", qty: "", unit_price: "", total: "" }],
    action_taken: r.action_taken ?? "",
    remarks: r.remarks ?? "",
    next_maintenance: r.next_maintenance ?? "",
    maintenance_count: r.maintenance_count ?? "",
    maintenance_interval_value:
      r.maintenance_interval_value === "" || r.maintenance_interval_value == null
        ? ""
        : String(r.maintenance_interval_value),
    maintenance_interval_unit: r.maintenance_interval_unit ?? "months",
    performed_by: r.performed_by ?? "",
    employee_signature: r.employee_signature ?? "",
    client_signature: r.client_signature ?? "",
    client_sign_name: r.client_sign_name ?? "",
    client_designation: r.client_designation ?? "",
    date_completed: r.date_completed ?? "",
  };
}

export function emptyReport(): ReportData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    client_name: "",
    client_email: "",
    contract: "",
    order_no: "",
    project: "",
    site_location: "",
    msr_no: "",
    our_ref_no: "",
    report_date: today,
    devices: {},
    spare_parts: [{ spare_no: "", description: "", qty: "", unit_price: "", total: "" }],
    action_taken: "",
    remarks: "",
    next_maintenance: "",
    maintenance_count: "",
    maintenance_interval_value: "",
    maintenance_interval_unit: "months",
    performed_by: "",
    employee_signature: "",
    client_signature: "",
    client_sign_name: "",
    client_designation: "",
    date_completed: "",
  };
}
