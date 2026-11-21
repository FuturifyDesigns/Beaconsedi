type Call = { id: string; patient_name: string | null; incident_code: string | null; assigned_unit_id: string | null; status: string };
type Vehicle = { id: string; call_sign: string; current_alert_id: string | null; status: string };

export function patientMapName(call: Pick<Call, "id" | "patient_name" | "incident_code">): string {
  return call.patient_name?.trim() || `Patient ${call.incident_code || call.id.slice(0, 8)}`;
}

export function patientMapLabel(call: Call, units: Vehicle[]): string {
  const unit = units.find(u => u.id === call.assigned_unit_id);
  return `${patientMapName(call)}\n${unit?.call_sign || (call.assigned_unit_id ? "Assigned ambulance" : "Unassigned")} · ${call.incident_code || call.id.slice(0, 8)}`;
}

export function vehicleMapLabel(unit: Vehicle, calls: Call[]): string {
  const open = calls.filter(call => !["resolved", "cancelled"].includes(call.status));
  // The incident assignment is authoritative; an old vehicle pointer must not
  // attach a patient name to a unit that has since been reassigned.
  const call = open.find(call => call.id === unit.current_alert_id && call.assigned_unit_id === unit.id)
    ?? open.find(call => call.assigned_unit_id === unit.id);
  return call
    ? `${unit.call_sign} → ${patientMapName(call)}\n${call.incident_code || call.id.slice(0, 8)}`
    : `${unit.call_sign} · ${unit.status.replaceAll("_", " ")}`;
}
