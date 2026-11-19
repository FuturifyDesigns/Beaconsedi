import { phoneValue, textValue, uuidValue } from "@/lib/validation";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type ReferralPriority, type ReferralStatus } from "@/lib/referrals";

type Ctx = { supabase: any; userId: string };

const STAFF_ROLES = ["admin", "operator", "hospital", "responder", "crew"] as const;
const COORDINATOR_ROLES = ["admin", "operator", "hospital"] as const;

async function hasAnyRole(ctx: Ctx, roles: readonly string[]): Promise<boolean> {
  for (const role of roles) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (data) return true;
  }
  return false;
}

async function requireStaff(ctx: Ctx) {
  if (!(await hasAnyRole(ctx, STAFF_ROLES))) throw new Error("Forbidden");
}

async function requireCoordinator(ctx: Ctx) {
  if (!(await hasAnyRole(ctx, COORDINATOR_ROLES))) throw new Error("Forbidden");
}

/** In-dashboard notifications for every coordinator (admins + operators + hospitals). */
async function notifyCoordinators(admin: any, title: string, body: string, severity: "info" | "warning" | "critical", referralId: string) {
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "operator", "hospital"]);
  const targets = [...new Set((roleRows ?? []).map((r: { user_id: string }) => r.user_id))];
  if (!targets.length) return;
  await admin.from("notifications").insert(
    targets.map((user_id) => ({
      user_id,
      kind: "referral",
      title,
      body,
      severity,
      alert_id: null,
    })),
  );
}

const REFERRAL_SELECT =
  "id, reference, from_facility_id, to_facility_id, patient_ref, patient_condition, priority, clinical_notes, ambulance_type, referring_doctor, contact_person, contact_phone, provider, unit_id, driver_name, driver_phone, crew, status, decision_note, accepted_at, departed_at, arrived_at, completed_at, total_distance_km, route_polyline, eta_minutes, created_by, created_at, updated_at";

/* ---------------------------------- reads ---------------------------------- */

/** Everything the command centre needs in one round trip. */
export const listReferralData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireStaff(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [referrals, facilities, units] = await Promise.all([
      supabaseAdmin.from("referrals").select(REFERRAL_SELECT).order("created_at", { ascending: false }).limit(300),
      supabaseAdmin.from("hospitals").select("id, name, latitude, longitude, phone, diversion_status").order("name"),
      supabaseAdmin
        .from("responder_units")
        .select("id, name, call_sign, kind, status, vehicle, registration_number, phone, latitude, longitude, heading, speed, last_location_update")
        .order("call_sign"),
    ]);
    if (referrals.error) throw referrals.error;
    if (facilities.error) throw facilities.error;
    if (units.error) throw units.error;
    return { referrals: referrals.data ?? [], facilities: facilities.data ?? [], units: units.data ?? [] };
  });

export const getReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: uuidValue(d.id, "referral") }))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireStaff(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: referral, error }, { data: history }, { data: handover }] = await Promise.all([
      supabaseAdmin.from("referrals").select(REFERRAL_SELECT).eq("id", data.id).maybeSingle(),
      supabaseAdmin.from("referral_status_history").select("*").eq("referral_id", data.id).order("created_at"),
      supabaseAdmin.from("referral_handover").select("*").eq("referral_id", data.id).order("created_at"),
    ]);
    if (error) throw error;
    if (!referral) throw new Error("Referral not found");
    const facilityIds = [referral.from_facility_id, referral.to_facility_id];
    const [{ data: facilities }, { data: unit }] = await Promise.all([
      supabaseAdmin.from("hospitals").select("id, name, latitude, longitude, phone, diversion_status").in("id", facilityIds),
      referral.unit_id
        ? supabaseAdmin
            .from("responder_units")
            .select("id, name, call_sign, kind, status, vehicle, registration_number, phone, latitude, longitude, heading, speed, last_location_update")
            .eq("id", referral.unit_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return { referral, history: history ?? [], handover: handover ?? [], facilities: facilities ?? [], unit: unit ?? null };
  });

/** Recent GPS pings for the assigned unit — used for stop and deviation detection. */
export const getReferralTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { unitId: string }) => ({ unitId: uuidValue(d.unitId, "vehicle") }))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireStaff(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pings, error } = await supabaseAdmin
      .from("responder_locations")
      .select("latitude, longitude, speed, recorded_at")
      .eq("unit_id", data.unitId)
      .order("recorded_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return pings ?? [];
  });

/* --------------------------------- writes ---------------------------------- */

const PRIORITIES: ReferralPriority[] = ["critical", "emergency", "urgent", "routine"];

type CreateInput = {
  fromFacilityId: string;
  toFacilityId: string;
  patientRef: string;
  priority: ReferralPriority;
  patientCondition?: string;
  clinicalNotes?: string;
  ambulanceType?: string;
  referringDoctor?: string;
  contactPerson?: string;
  contactPhone?: string;
  provider?: string;
};

export const createReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreateInput) => {
    const opt = (v?: string) => (textValue(v, "Referral detail", 400) || null);
    const patientRef = textValue(d.patientRef, "Patient reference", 80, true);
    if (!d.fromFacilityId || !d.toFacilityId) throw new Error("Choose both facilities");
    if (d.fromFacilityId === d.toFacilityId) throw new Error("Departure and destination must differ");
    if (!patientRef) throw new Error("Patient reference number is required");
    if (!PRIORITIES.includes(d.priority)) throw new Error("Invalid priority");
    return {
      fromFacilityId: uuidValue(d.fromFacilityId, "referring facility"),
      toFacilityId: uuidValue(d.toFacilityId, "receiving facility"),
      patientRef,
      priority: d.priority,
      patientCondition: opt(d.patientCondition),
      clinicalNotes: opt(d.clinicalNotes),
      ambulanceType: opt(d.ambulanceType),
      referringDoctor: opt(d.referringDoctor),
      contactPerson: opt(d.contactPerson),
      contactPhone: phoneValue(d.contactPhone, "Contact phone") || null,
      provider: opt(d.provider),
    };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireCoordinator(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await ctx.supabase.rpc("create_referral", { _payload: data });
    if (error) throw error;
    await notifyCoordinators(supabaseAdmin, "New ambulance referral", `Referral ${row.reference} is awaiting a decision.`, data.priority === "critical" ? "critical" : "info", row.id);
    return { ok: true, id: row.id as string, reference: row.reference as string };
  });

export const respondReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; decision: "accept" | "decline"; note?: string }) => {
    if (d.decision !== "accept" && d.decision !== "decline") throw new Error("Invalid decision");
    return { id: uuidValue(d.id, "referral"), decision: d.decision, note: textValue(d.note, "Note", 400) || null };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireCoordinator(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await ctx.supabase.rpc("mutate_referral", { _id: data.id, _action: "respond", _payload: data });
    if (error) throw error;
    await notifyCoordinators(supabaseAdmin, `Referral ${result.status}`, `Referral ${result.reference} was ${result.status}.`, result.status === "declined" ? "warning" : "info", data.id);
    return { ok: true };
  });

type AssignInput = {
  id: string;
  unitId: string;
  driverName?: string;
  driverPhone?: string;
  crew?: string;
  provider?: string;
  totalDistanceKm?: number | null;
  routePolyline?: string | null;
  etaMinutes?: number | null;
};

export const assignReferralUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AssignInput) => {
    if ((d.totalDistanceKm != null && (!Number.isFinite(d.totalDistanceKm) || d.totalDistanceKm < 0)) || (d.etaMinutes != null && (!Number.isFinite(d.etaMinutes) || d.etaMinutes < 0))) throw new Error("Distance and ETA must be positive numbers");
    if (!d.id || !d.unitId) throw new Error("Referral and vehicle are required");
    const opt = (v?: string) => (textValue(v, "Assignment detail", 200) || null);
    return {
      id: uuidValue(d.id, "referral"),
      unitId: uuidValue(d.unitId, "vehicle"),
      driverName: opt(d.driverName),
      driverPhone: phoneValue(d.driverPhone, "Driver phone") || null,
      crew: opt(d.crew),
      provider: opt(d.provider),
      totalDistanceKm: typeof d.totalDistanceKm === "number" && Number.isFinite(d.totalDistanceKm) ? d.totalDistanceKm : null,
      routePolyline: d.routePolyline ? textValue(d.routePolyline, "Route", 100000) : null,
      etaMinutes: typeof d.etaMinutes === "number" && Number.isFinite(d.etaMinutes) ? Math.round(d.etaMinutes) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireCoordinator(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await ctx.supabase.rpc("mutate_referral", { _id: data.id, _action: "assign", _payload: data });
    if (error) throw error;
    await notifyCoordinators(supabaseAdmin, "Ambulance assigned", `Vehicle assigned to referral ${result.reference}.`, "info", data.id);
    return { ok: true };
  });

export const advanceReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; to: ReferralStatus; note?: string; handoverReceivedBy?: string; handoverNotes?: string }) => {
    return {
      id: uuidValue(d.id, "referral"),
      to: d.to,
      note: textValue(d.note, "Note", 400) || null,
      handoverReceivedBy: textValue(d.handoverReceivedBy, "Received by", 120) || null,
      handoverNotes: textValue(d.handoverNotes, "Handover notes", 400) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireStaff(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await ctx.supabase.rpc("mutate_referral", { _id: data.id, _action: "advance", _payload: data });
    if (error) throw error;
    await notifyCoordinators(supabaseAdmin, "Referral updated", `Referral ${result.reference}: ${result.status.replace(/_/g, " ")}.`, result.status === "cancelled" ? "warning" : "info", data.id);
    return { ok: true };
  });
