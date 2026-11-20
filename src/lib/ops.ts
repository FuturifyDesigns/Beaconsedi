import { supabase } from "@/integrations/supabase/client";

/* ---------------------------------- types --------------------------------- */

export type Priority = "critical" | "high" | "medium" | "low";

export type Incident = {
  id: string;
  incident_code: string | null;
  priority: string;
  incident_type: string;
  status: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: string | null;
  message: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  responder_id: string | null;
  responder_notes: string | null;
  assigned_unit_id: string | null;
  eta_minutes: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  is_test?: boolean;
  heading?: number | null;
  speed?: number | null;
  altitude?: number | null;
  location_source?: string | null;
  location_updated_at?: string | null;
  location_sharing?: boolean;
  priority_reason?: string | null;
  patient_count?: number;
  triage?: TriageReport | null;
};

export type TriageReport = {
  trauma_type?: string;
  mechanism?: string;
  consciousness?: string;
  breathing?: string;
  bleeding?: string;
  spinal?: string;
  patient_count?: number;
  hazards?: string;
  resources?: string;
  recorded_at?: string;
  recorded_by?: string | null;
};

export type IncidentMessage = {
  id: string;
  alert_id: string;
  sender_id: string | null;
  sender_label: string | null;
  sender_role: string;
  recipient_role: string;
  body: string;
  urgent: boolean;
  read_at: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type Unit = {
  id: string;
  name: string;
  kind: string;
  call_sign: string;
  vehicle: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  current_alert_id: string | null;
  eta_minutes: number | null;
  phone: string | null;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  last_location_update?: string | null;
  updated_at: string;
};

export type Hospital = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  trauma_beds_total: number;
  trauma_beds_available: number;
  icu_total: number;
  icu_available: number;
  theatres_total: number;
  theatres_available: number;
  ambulance_bays_total: number;
  ambulance_bays_available: number;
  diversion_status: string;
};

export type IncidentEvent = {
  id: string;
  alert_id: string;
  event_type: string;
  note: string | null;
  actor_id: string | null;
  created_at: string;
};

/* --------------------------------- display -------------------------------- */

type Meta = { label: string; dot: string; text: string; chip: string };

export const PRIORITY_META: Record<string, Meta> = {
  critical: { label: "Critical", dot: "bg-emergency", text: "text-emergency", chip: "bg-emergency/15 text-emergency ring-1 ring-emergency/40" },
  high: { label: "High", dot: "bg-warning", text: "text-warning", chip: "bg-warning/15 text-warning ring-1 ring-warning/40" },
  medium: { label: "Medium", dot: "bg-sky-400", text: "text-sky-400", chip: "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/40" },
  low: { label: "Low", dot: "bg-success", text: "text-success", chip: "bg-success/15 text-success ring-1 ring-success/40" },
};

export const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

export const PRIORITY_HEX: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#38bdf8",
  low: "#22c55e",
};

export const INCIDENT_STATUS: Record<string, Meta> = {
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground", text: "text-muted-foreground", chip: "bg-muted text-muted-foreground" },
  active: { label: "Awaiting dispatch", dot: "bg-emergency", text: "text-emergency", chip: "bg-emergency/15 text-emergency" },
  acknowledged: { label: "Acknowledged", dot: "bg-warning", text: "text-warning", chip: "bg-warning/15 text-warning" },
  dispatched: { label: "Dispatched", dot: "bg-sky-400", text: "text-sky-300", chip: "bg-sky-400/15 text-sky-300" },
  on_scene: { label: "On scene", dot: "bg-violet-400", text: "text-violet-300", chip: "bg-violet-400/15 text-violet-300" },
  transporting: { label: "Transporting", dot: "bg-indigo-400", text: "text-indigo-300", chip: "bg-indigo-400/15 text-indigo-300" },
  resolved: { label: "Closed", dot: "bg-success", text: "text-success", chip: "bg-success/15 text-success" },
};

export const UNIT_STATUS: Record<string, Meta> = {
  available: { label: "Available", dot: "bg-success", text: "text-success", chip: "bg-success/15 text-success" },
  en_route: { label: "En route", dot: "bg-sky-400", text: "text-sky-300", chip: "bg-sky-400/15 text-sky-300" },
  on_scene: { label: "On scene", dot: "bg-violet-400", text: "text-violet-300", chip: "bg-violet-400/15 text-violet-300" },
  transporting: { label: "Transporting", dot: "bg-indigo-400", text: "text-indigo-300", chip: "bg-indigo-400/15 text-indigo-300" },
  busy: { label: "Busy", dot: "bg-warning", text: "text-warning", chip: "bg-warning/15 text-warning" },
  offline: { label: "Offline", dot: "bg-muted-foreground", text: "text-muted-foreground", chip: "bg-muted text-muted-foreground" },
};

export const UNIT_KIND: Record<string, { label: string; glyph: string; hex: string }> = {
  ambulance: { label: "Ambulance", glyph: "A", hex: "#22c55e" },
  police: { label: "Police", glyph: "P", hex: "#3b82f6" },
  fire: { label: "Fire", glyph: "F", hex: "#f97316" },
  rescue: { label: "Rescue", glyph: "R", hex: "#a855f7" },
  air: { label: "Air ambulance", glyph: "H", hex: "#06b6d4" },
};

export const DIVERSION: Record<string, Meta> = {
  open: { label: "Accepting", dot: "bg-success", text: "text-success", chip: "bg-success/15 text-success" },
  limited: { label: "Limited", dot: "bg-warning", text: "text-warning", chip: "bg-warning/15 text-warning" },
  diverting: { label: "On diversion", dot: "bg-emergency", text: "text-emergency", chip: "bg-emergency/15 text-emergency" },
};

export const EVENT_LABEL: Record<string, string> = {
  sos_received: "SOS received",
  gps_confirmed: "GPS confirmed",
  dispatcher_assigned: "Dispatcher assigned",
  unit_dispatched: "Unit dispatched",
  responder_accepted: "Responder accepted",
  arrived_on_scene: "Arrived on scene",
  patient_loaded: "Patient loaded",
  hospital_notified: "Hospital notified",
  hospital_arrival: "Hospital arrival",
  escalated: "Incident escalated",
  backup_requested: "Backup requested",
  broadcast_sent: "Emergency broadcast sent",
  mass_casualty: "Mass casualty mode",
  incident_closed: "Incident closed",
  note: "Note added",
};

/* --------------------------------- helpers -------------------------------- */

export function sincePretty(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

/** Seconds since an ISO timestamp. */
export function secondsSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

export function agoPrecise(iso: string): string {
  const s = secondsSince(iso);
  if (s < 60) return `${s}s ago`;
  return `${sincePretty(iso)} ago`;
}

export type LocationFreshness = "live" | "recent" | "stale" | "lost";

/** Classifies how trustworthy the last position report is. */
export function locationFreshness(incident: Pick<Incident, "updated_at" | "location_updated_at" | "location_sharing">): LocationFreshness {
  if (incident.location_sharing === false) return "lost";
  const iso = incident.location_updated_at ?? incident.updated_at;
  const s = secondsSince(iso);
  if (s <= 15) return "live";
  if (s <= 90) return "recent";
  if (s <= 600) return "stale";
  return "lost";
}

export const FRESHNESS_META: Record<LocationFreshness, { label: string; chip: string }> = {
  live: { label: "Live location", chip: "bg-success/15 text-success ring-1 ring-success/40" },
  recent: { label: "Recent fix", chip: "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/40" },
  stale: { label: "Last known location", chip: "bg-warning/15 text-warning ring-1 ring-warning/40" },
  lost: { label: "Location update lost", chip: "bg-emergency/15 text-emergency ring-1 ring-emergency/40" },
};

/** Rejects impossible coordinates before anything is written or navigated to. */
export function validCoords(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function minutesSince(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Rough ETA using an urban blue-light average speed, floored at 2 minutes. */
export function estimateEta(km: number, kind = "ambulance"): number {
  const speed = kind === "air" ? 200 : 42; // km/h
  return Math.max(2, Math.round((km / speed) * 60));
}

export function nearestUnit(incident: Incident, units: Unit[], kind?: string) {
  const pool = units.filter(
    (u) => u.latitude != null && u.longitude != null && u.status === "available" && (!kind || u.kind === kind),
  );
  if (!pool.length) return null;
  return pool
    .map((u) => {
      const km = distanceKm({ lat: incident.latitude, lng: incident.longitude }, { lat: u.latitude!, lng: u.longitude! });
      return { unit: u, km, eta: estimateEta(km, u.kind) };
    })
    .sort((a, b) => a.km - b.km)[0];
}

export function nearestHospital(incident: Incident, hospitals: Hospital[]) {
  const pool = hospitals.filter((h) => h.diversion_status !== "diverting");
  const list = pool.length ? pool : hospitals;
  if (!list.length) return null;
  return list
    .map((h) => ({
      hospital: h,
      km: distanceKm({ lat: incident.latitude, lng: incident.longitude }, { lat: h.latitude, lng: h.longitude }),
    }))
    .sort((a, b) => a.km - b.km)[0];
}

/* ------------------------------- write paths ------------------------------ */

async function actorId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function logEvent(alertId: string, eventType: string, note?: string) {
  const actor_id = await actorId();
  const { error } = await supabase
    .from("incident_events")
    .insert({ alert_id: alertId, event_type: eventType, note: note ?? null, actor_id });
  if (error) throw error;
}

export async function logAudit(action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  const actor_id = await actorId();
  if (!actor_id) return;
  await supabase.from("audit_logs").insert({
    actor_id,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: (metadata ?? {}) as never,
  });
}
