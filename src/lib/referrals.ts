import { distanceKm } from "@/lib/ops";

/* ---------------------------------- types --------------------------------- */

export type ReferralPriority = "critical" | "emergency" | "urgent" | "routine";

export type ReferralStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "assigned"
  | "preparing"
  | "departed"
  | "en_route"
  | "approaching"
  | "arrived"
  | "handover"
  | "completed"
  | "cancelled";

export type Referral = {
  id: string;
  reference: string;
  from_facility_id: string;
  to_facility_id: string;
  patient_ref: string;
  patient_condition: string | null;
  priority: ReferralPriority;
  clinical_notes: string | null;
  ambulance_type: string | null;
  referring_doctor: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  provider: string | null;
  unit_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  crew: string | null;
  status: ReferralStatus;
  decision_note: string | null;
  accepted_at: string | null;
  departed_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  total_distance_km: number | null;
  route_polyline: string | null;
  eta_minutes: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ReferralHistoryEntry = {
  id: string;
  referral_id: string;
  status: string;
  note: string | null;
  actor_id: string | null;
  created_at: string;
};

export type ReferralHandover = {
  id: string;
  referral_id: string;
  received_by: string;
  notes: string | null;
  created_at: string;
};

export type ReferralFacility = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  diversion_status: string;
};

export type ReferralUnit = {
  id: string;
  name: string;
  call_sign: string;
  kind: string;
  status: string;
  vehicle: string | null;
  registration_number: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  speed: number | null;
  last_location_update: string | null;
};

/* --------------------------------- display -------------------------------- */

export const REFERRAL_PRIORITY: Record<ReferralPriority, { label: string; chip: string; hex: string }> = {
  critical: { label: "Critical", chip: "bg-emergency/15 text-emergency ring-1 ring-emergency/40", hex: "#ef4444" },
  emergency: { label: "Emergency", chip: "bg-warning/15 text-warning ring-1 ring-warning/40", hex: "#f59e0b" },
  urgent: { label: "Urgent", chip: "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/40", hex: "#38bdf8" },
  routine: { label: "Routine", chip: "bg-success/15 text-success ring-1 ring-success/40", hex: "#22c55e" },
};

export const REFERRAL_STATUS: Record<ReferralStatus, { label: string; chip: string }> = {
  pending: { label: "Pending", chip: "bg-warning/15 text-warning" },
  accepted: { label: "Accepted", chip: "bg-sky-400/15 text-sky-300" },
  declined: { label: "Declined", chip: "bg-emergency/15 text-emergency" },
  assigned: { label: "Ambulance assigned", chip: "bg-sky-400/15 text-sky-300" },
  preparing: { label: "Preparing departure", chip: "bg-sky-400/15 text-sky-300" },
  departed: { label: "Departed", chip: "bg-indigo-400/15 text-indigo-300" },
  en_route: { label: "En route", chip: "bg-indigo-400/15 text-indigo-300" },
  approaching: { label: "Approaching", chip: "bg-violet-400/15 text-violet-300" },
  arrived: { label: "Arrived", chip: "bg-violet-400/15 text-violet-300" },
  handover: { label: "Handover", chip: "bg-success/15 text-success" },
  completed: { label: "Completed", chip: "bg-success/15 text-success" },
  cancelled: { label: "Cancelled", chip: "bg-muted text-muted-foreground" },
};

/** Statuses where the referral is still in play on the command centre. */
export const ACTIVE_STATUSES: ReferralStatus[] = [
  "accepted",
  "assigned",
  "preparing",
  "departed",
  "en_route",
  "approaching",
  "arrived",
  "handover",
];

/** Statuses where the ambulance is physically moving between facilities. */
export const TRACKING_STATUSES: ReferralStatus[] = ["departed", "en_route", "approaching"];

/**
 * The visual journey timeline. Each stage maps to the referral status that
 * marks it complete; the index of the current status tells us how far the
 * journey has progressed.
 */
export const JOURNEY_STAGES: { key: string; label: string; status: ReferralStatus }[] = [
  { key: "initiated", label: "Referral initiated", status: "pending" },
  { key: "notified", label: "Receiving facility notified", status: "pending" },
  { key: "decision", label: "Referral accepted or declined", status: "accepted" },
  { key: "assigned", label: "Ambulance assigned", status: "assigned" },
  { key: "prepared", label: "Ambulance prepared for departure", status: "preparing" },
  { key: "departed", label: "Ambulance departed", status: "departed" },
  { key: "en_route", label: "Ambulance en route", status: "en_route" },
  { key: "approaching", label: "Ambulance approaching destination", status: "approaching" },
  { key: "arrived", label: "Ambulance arrived", status: "arrived" },
  { key: "handover", label: "Patient handed over", status: "handover" },
  { key: "completed", label: "Referral completed", status: "completed" },
];

/** Order used to compare journey progress. */
const STATUS_ORDER: ReferralStatus[] = [
  "pending",
  "accepted",
  "assigned",
  "preparing",
  "departed",
  "en_route",
  "approaching",
  "arrived",
  "handover",
  "completed",
];

export function statusRank(s: ReferralStatus): number {
  if (s === "declined" || s === "cancelled") return -1;
  return STATUS_ORDER.indexOf(s);
}

/** Which transitions are legal from each status. */
export const NEXT_STATUSES: Partial<Record<ReferralStatus, ReferralStatus[]>> = {
  pending: ["accepted", "declined", "cancelled"],
  accepted: ["assigned", "cancelled"],
  assigned: ["preparing", "cancelled"],
  preparing: ["departed", "cancelled"],
  departed: ["en_route", "cancelled"],
  en_route: ["approaching", "arrived", "cancelled"],
  approaching: ["arrived", "cancelled"],
  arrived: ["handover", "cancelled"],
  handover: ["completed"],
};

/* --------------------------------- helpers -------------------------------- */

export { decodePolyline } from "@/lib/polyline";

/** Remaining km from the unit's live position to the destination facility. */
export function remainingKm(
  unit: Pick<ReferralUnit, "latitude" | "longitude"> | null | undefined,
  destination: Pick<ReferralFacility, "latitude" | "longitude"> | null | undefined,
): number | null {
  if (!unit || !destination || unit.latitude == null || unit.longitude == null) return null;
  return distanceKm({ lat: unit.latitude, lng: unit.longitude }, { lat: destination.latitude, lng: destination.longitude });
}

/** Distance already covered, from the stored route total minus what remains. */
export function travelledKm(referral: Pick<Referral, "total_distance_km">, remaining: number | null): number | null {
  if (referral.total_distance_km == null || remaining == null) return null;
  return Math.max(0, referral.total_distance_km - remaining);
}

export function kmPretty(km: number | null | undefined): string {
  if (km == null) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km >= 100 ? 0 : 1)} km`;
}

export function etaPretty(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${Math.round(minutes % 60)} min`;
}

/** Live ETA: remaining distance at a long-distance ambulance cruise speed. */
export function liveEtaMinutes(remaining: number | null, speedKph?: number | null): number | null {
  if (remaining == null) return null;
  const cruise = speedKph != null && speedKph > 20 ? speedKph : 80;
  return Math.max(1, Math.round((remaining / cruise) * 60));
}
