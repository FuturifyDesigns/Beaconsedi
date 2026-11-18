import { getSoundSettings } from "@/lib/sound-settings";
import { supabase } from "@/integrations/supabase/client";

/* ---------------------------------- types --------------------------------- */

export type ResponderProfile = {
  id: string;
  user_id: string;
  full_name: string | null;
  national_id: string | null;
  employee_number: string | null;
  responder_code: string | null;
  photo_url: string | null;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  home_station: string | null;
  department: string | null;
  license_number: string | null;
  license_expiry: string | null;
  certification_level: string;
  organization: string | null;
  rank: string | null;
  years_of_service: number;
  assigned_unit_id: string | null;
  availability: string;
  updated_at: string;
};

export type Shift = {
  id: string;
  user_id: string;
  unit_id: string | null;
  started_at: string;
  ended_at: string | null;
  break_started_at: string | null;
  break_seconds: number;
  status: string;
  notes: string | null;
};

export type ShiftEvent = {
  id: string;
  shift_id: string;
  user_id: string;
  event_type: string;
  note: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  severity: string;
  alert_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type PatientProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  blood_type: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  medications: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  medical_notes: string | null;
  special_needs: string | null;
};

/* --------------------------------- display -------------------------------- */

export const CERT_LEVELS: Record<string, string> = {
  emt_basic: "EMT Basic",
  emt_intermediate: "EMT Intermediate",
  paramedic: "Paramedic",
  als: "Advanced Life Support",
  firefighter: "Firefighter",
  police: "Police Officer",
  sar: "Search & Rescue",
};

type Chip = { label: string; chip: string; dot: string };

/** Status indicators pair colour with a distinct label + shape cue for colour-blind users. */
export const AVAILABILITY: Record<string, Chip> = {
  available: { label: "Available", chip: "bg-success/15 text-success ring-1 ring-success/40", dot: "bg-success" },
  responding: { label: "Responding", chip: "bg-emergency/15 text-emergency ring-1 ring-emergency/40", dot: "bg-emergency" },
  on_scene: { label: "On scene", chip: "bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/40", dot: "bg-violet-400" },
  transporting: { label: "Transporting", chip: "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/40", dot: "bg-sky-400" },
  on_break: { label: "On break", chip: "bg-warning/15 text-warning ring-1 ring-warning/40", dot: "bg-warning" },
  offline: { label: "Offline", chip: "bg-muted text-muted-foreground ring-1 ring-border", dot: "bg-muted-foreground" },
};

export const AVAILABILITY_ORDER = ["available", "responding", "on_scene", "transporting", "on_break", "offline"];

export const VEHICLE_STATUS: Record<string, Chip> = {
  available: { label: "Available", chip: "bg-success/15 text-success", dot: "bg-success" },
  en_route: { label: "In service", chip: "bg-sky-400/15 text-sky-300", dot: "bg-sky-400" },
  on_scene: { label: "Responding", chip: "bg-emergency/15 text-emergency", dot: "bg-emergency" },
  transporting: { label: "Transporting", chip: "bg-indigo-400/15 text-indigo-300", dot: "bg-indigo-400" },
  busy: { label: "Maintenance", chip: "bg-warning/15 text-warning", dot: "bg-warning" },
  offline: { label: "Offline", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

export const SHIFT_EVENT_LABEL: Record<string, string> = {
  clock_in: "Clocked in",
  clock_out: "Clocked out",
  break_start: "Break started",
  break_end: "Break ended",
  status_change: "Status changed",
  vehicle_assigned: "Vehicle assigned",
};

/* --------------------------------- helpers -------------------------------- */

export function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

/** Worked seconds for a shift, excluding breaks (including an open break). */
export function workedSeconds(shift: Shift, now = Date.now()): number {
  const end = shift.ended_at ? new Date(shift.ended_at).getTime() : now;
  const gross = Math.max(0, (end - new Date(shift.started_at).getTime()) / 1000);
  const openBreak = shift.break_started_at ? (now - new Date(shift.break_started_at).getTime()) / 1000 : 0;
  return Math.max(0, gross - shift.break_seconds - openBreak);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function licenseExpiryState(expiry: string | null): "valid" | "expiring" | "expired" | "unknown" {
  if (!expiry) return "unknown";
  const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days < 60) return "expiring";
  return "valid";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/* ------------------------------- write paths ------------------------------ */

export async function logShiftEvent(shiftId: string, userId: string, eventType: string, note?: string) {
  await supabase.from("shift_events").insert({ shift_id: shiftId, user_id: userId, event_type: eventType, note: note ?? null });
}

/** Short, non-blocking alert tone for high-priority incidents. */
export function playAlertTone() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume?.();
    const t0 = ctx.currentTime;
    // Responder alarms follow the volume setting but never go fully silent (min 30%).
    const vol = Math.max(0.3, getSoundSettings().volume / 100);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = "square";
    // Three rising two-tone beeps — a recognisable incoming-alert siren.
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.42;
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(1180, t + 0.16);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.14 * vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    }
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + 1.3);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable — visual alerts still fire */
  }
}
