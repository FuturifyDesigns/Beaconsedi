import type { Incident, Unit } from "@/lib/ops";

export function activeDispatches(incidents: Incident[]) {
  return incidents.filter(i => !!i.assigned_unit_id && !["resolved", "cancelled"].includes(i.status));
}

export function dispatchMapScope(incidents: Incident[], units: Unit[], selectedId: string | null, focused: boolean) {
  if (!focused) return { incidents, units };
  const selected = incidents.find(i => i.id === selectedId && !["resolved", "cancelled"].includes(i.status));
  return {
    incidents: selected ? [selected] : [],
    units: selected?.assigned_unit_id ? units.filter(u => u.id === selected.assigned_unit_id) : [],
  };
}
