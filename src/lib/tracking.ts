import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "@/lib/ops";

/* --------------------------------- types ---------------------------------- */

export type ResponderPing = {
  id: string;
  unit_id: string | null;
  responder_id: string | null;
  incident_id: string | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  status: string | null;
  recorded_at: string;
};

export type TrackPoint = { lat: number; lng: number; heading: number | null; speed: number | null; accuracy: number | null; at: string };

/* ------------------------------ response status ---------------------------- */

/**
 * Operational status shown to dispatchers and patients. Derived from the
 * incident stage, the assigned unit's status and its distance to the scene —
 * we never invent a state that the underlying data does not support.
 */
export type ResponseStatus =
  | "available" | "dispatched" | "accepted" | "responding" | "arriving"
  | "on_scene" | "patient_contact" | "transporting" | "completed" | "cancelled";

export const RESPONSE_STATUS_META: Record<ResponseStatus, { label: string; patient: string; chip: string }> = {
  available: { label: "Available", patient: "Locating the nearest emergency unit…", chip: "bg-success/15 text-success" },
  dispatched: { label: "Dispatched", patient: "Searching for a responder…", chip: "bg-warning/15 text-warning" },
  accepted: { label: "Accepted", patient: "A responder accepted your emergency", chip: "bg-sky-400/15 text-sky-300" },
  responding: { label: "Responding", patient: "Your responder is on the way", chip: "bg-sky-400/15 text-sky-300" },
  arriving: { label: "Arriving", patient: "Your responder is arriving now", chip: "bg-indigo-400/15 text-indigo-300" },
  on_scene: { label: "On scene", patient: "Responder on scene", chip: "bg-violet-400/15 text-violet-300" },
  patient_contact: { label: "Patient contact", patient: "Responder is with the patient", chip: "bg-violet-400/15 text-violet-300" },
  transporting: { label: "Transporting", patient: "You are being transported to hospital", chip: "bg-indigo-400/15 text-indigo-300" },
  completed: { label: "Completed", patient: "Emergency closed", chip: "bg-success/15 text-success" },
  cancelled: { label: "Cancelled", patient: "Emergency cancelled", chip: "bg-muted text-muted-foreground" },
};

/** Distance (km) below which a responding unit is considered to be arriving. */
export const ARRIVING_KM = 0.8;

export function responseStatus(args: {
  incidentStatus: string;
  unitStatus?: string | null;
  hasUnit: boolean;
  distanceKmToScene?: number | null;
  accepted?: boolean;
}): ResponseStatus {
  const { incidentStatus, unitStatus, hasUnit, distanceKmToScene, accepted } = args;
  if (incidentStatus === "resolved") return "completed";
  if (incidentStatus === "cancelled") return "cancelled";
  if (incidentStatus === "transporting" || unitStatus === "transporting") return "transporting";
  if (incidentStatus === "on_scene" || unitStatus === "on_scene") return "on_scene";
  if (!hasUnit) return incidentStatus === "active" ? "available" : "dispatched";
  if (unitStatus === "en_route" || incidentStatus === "dispatched") {
    if (distanceKmToScene != null && distanceKmToScene <= ARRIVING_KM) return "arriving";
    return accepted === false ? "dispatched" : "responding";
  }
  return "accepted";
}

/* ------------------------------- gps freshness ----------------------------- */

export type GpsState = "live" | "recent" | "stale" | "lost";

export function gpsState(at: string | null | undefined): GpsState {
  if (!at) return "lost";
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s <= 20) return "live";
  if (s <= 45) return "recent";
  if (s <= 180) return "stale";
  return "lost";
}

export const GPS_STATE_META: Record<GpsState, { label: string; chip: string }> = {
  live: { label: "GPS live", chip: "bg-success/15 text-success" },
  recent: { label: "GPS recent", chip: "bg-sky-400/15 text-sky-300" },
  stale: { label: "GPS signal stale", chip: "bg-warning/15 text-warning" },
  lost: { label: "GPS signal lost", chip: "bg-emergency/15 text-emergency" },
};

/* ------------------------------ publish strategy --------------------------- */

/**
 * Adaptive emergency-dispatch throttle: never spam the backend, but tighten up
 * as the unit closes on the scene or changes direction sharply.
 */
export function shouldPublish(args: {
  last: TrackPoint | null;
  next: TrackPoint;
  distanceToSceneKm: number | null;
  responding: boolean;
}): boolean {
  const { last, next, distanceToSceneKm, responding } = args;
  if (!last) return true;
  const movedM = distanceKm({ lat: last.lat, lng: last.lng }, { lat: next.lat, lng: next.lng }) * 1000;
  const ageMs = new Date(next.at).getTime() - new Date(last.at).getTime();

  const close = responding && distanceToSceneKm != null && distanceToSceneKm <= 2;
  const minMeters = close ? 15 : responding ? 30 : 120;
  const maxIdleMs = close ? 5_000 : responding ? 12_000 : 60_000;

  if (movedM >= minMeters) return true;
  if (ageMs >= maxIdleMs) return true;

  const turned =
    last.heading != null && next.heading != null &&
    Math.abs(((next.heading - last.heading + 540) % 360) - 180) > 35;
  return turned && movedM > 5;
}

/** Writes a GPS ping; the backend trigger syncs the unit's current position. */
export async function publishPing(p: {
  unitId: string | null;
  responderId: string;
  incidentId: string | null;
  point: TrackPoint;
  status: string | null;
}): Promise<void> {
  const { error } = await supabase.from("responder_locations").insert({
    unit_id: p.unitId,
    responder_id: p.responderId,
    incident_id: p.incidentId,
    latitude: p.point.lat,
    longitude: p.point.lng,
    heading: p.point.heading,
    speed: p.point.speed,
    accuracy: p.point.accuracy,
    status: p.status,
    recorded_at: p.point.at,
  });
  if (error) throw error;
}

/** Bearing in degrees from a → b, used when the device reports no heading. */
export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Metres between the unit and the nearest point of the planned route. */
export function offRouteMeters(point: { lat: number; lng: number }, path: { lat: number; lng: number }[]): number | null {
  if (path.length < 2) return null;
  let best = Infinity;
  for (const p of path) {
    const d = distanceKm(point, p) * 1000;
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : null;
}
