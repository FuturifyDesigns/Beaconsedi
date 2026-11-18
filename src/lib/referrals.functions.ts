import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { NEXT_STATUSES, type ReferralPriority, type ReferralStatus } from "@/lib/referrals";

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

async function recordHistory(admin: any, referralId: string, status: string, actorId: string, note?: string | null) {
  await admin.from("referral_status_history").insert({
    referral_id: referralId,
    status,
    note: note ?? null,
    actor_id: actorId,
  });
}

async function audit(admin: any, actorId: string, action: string, referralId: string, metadata: Record<string, unknown>) {
  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    target_type: "referral",
    target_id: referralId,
    metadata: metadata as never,
  });
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
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
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
  .inputValidator((d: { unitId: string }) => ({ unitId: String(d.unitId) }))
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
    const opt = (v?: string) => (v ? String(v).trim().slice(0, 400) || null : null);
    const patientRef = String(d.patientRef ?? "").trim().slice(0, 80);
    if (!d.fromFacilityId || !d.toFacilityId) throw new Error("Choose both facilities");
    if (d.fromFacilityId === d.toFacilityId) throw new Error("Departure and destination must differ");
    if (!patientRef) throw new Error("Patient reference number is required");
    if (!PRIORITIES.includes(d.priority)) throw new Error("Invalid priority");
    return {
      fromFacilityId: d.fromFacilityId,
      toFacilityId: d.toFacilityId,
      patientRef,
      priority: d.priority,
      patientCondition: opt(d.patientCondition),
      clinicalNotes: opt(d.clinicalNotes),
      ambulanceType: opt(d.ambulanceType),
      referringDoctor: opt(d.referringDoctor),
      contactPerson: opt(d.contactPerson),
      contactPhone: opt(d.contactPhone),
      provider: opt(d.provider),
    };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireCoordinator(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Duplicate prevention: same patient, same route, still open.
    const { data: dupe } = await supabaseAdmin
      .from("referrals")
      .select("id, reference")
      .eq("patient_ref", data.patientRef)
      .eq("from_facility_id", data.fromFacilityId)
      .eq("to_facility_id", data.toFacilityId)
      .not("status", "in", "(completed,cancelled,declined)")
      .maybeSingle();
    if (dupe) throw new Error(`An open referral ${dupe.reference} already exists for this patient on this route`);

    const { data: row, error } = await supabaseAdmin
      .from("referrals")
      .insert({
        from_facility_id: data.fromFacilityId,
        to_facility_id: data.toFacilityId,
        patient_ref: data.patientRef,
        priority: data.priority,
        patient_condition: data.patientCondition,
        clinical_notes: data.clinicalNotes,
        ambulance_type: data.ambulanceType,
        referring_doctor: data.referringDoctor,
        contact_person: data.contactPerson,
        contact_phone: data.contactPhone,
        provider: data.provider,
        created_by: ctx.userId,
      })
      .select("id, reference")
      .single();
    if (error) throw error;
    await recordHistory(supabaseAdmin, row.id, "pending", ctx.userId, "Referral initiated; receiving facility notified");
    await notifyCoordinators(supabaseAdmin, "New referral received", `Referral ${row.reference} awaits a decision.`, data.priority === "critical" ? "critical" : "info", row.id);
    await audit(supabaseAdmin, ctx.userId, "referral_created", row.id, { reference: row.reference, priority: data.priority });
    return { ok: true, id: row.id, reference: row.reference };
  });

export const respondReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; decision: "accept" | "decline"; note?: string }) => {
    if (d.decision !== "accept" && d.decision !== "decline") throw new Error("Invalid decision");
    return { id: String(d.id), decision: d.decision, note: d.note ? String(d.note).slice(0, 400) : null };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireCoordinator(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ref } = await supabaseAdmin.from("referrals").select("id, reference, status").eq("id", data.id).single();
    if (!ref) throw new Error("Referral not found");
    if (ref.status !== "pending") throw new Error("This referral has already been decided");
    const status: ReferralStatus = data.decision === "accept" ? "accepted" : "declined";
    const { error } = await supabaseAdmin
      .from("referrals")
      .update({ status, decision_note: data.note, accepted_at: status === "accepted" ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw error;
    await recordHistory(supabaseAdmin, data.id, status, ctx.userId, data.note);
    await notifyCoordinators(supabaseAdmin, `Referral ${status}`, `Referral ${ref.reference} was ${status}.`, status === "declined" ? "warning" : "info", data.id);
    await audit(supabaseAdmin, ctx.userId, `referral_${status}`, data.id, { reference: ref.reference });
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
    if (!d.id || !d.unitId) throw new Error("Referral and vehicle are required");
    const opt = (v?: string) => (v ? String(v).trim().slice(0, 200) || null : null);
    return {
      id: String(d.id),
      unitId: String(d.unitId),
      driverName: opt(d.driverName),
      driverPhone: opt(d.driverPhone),
      crew: opt(d.crew),
      provider: opt(d.provider),
      totalDistanceKm: typeof d.totalDistanceKm === "number" && Number.isFinite(d.totalDistanceKm) ? d.totalDistanceKm : null,
      routePolyline: d.routePolyline ? String(d.routePolyline) : null,
      etaMinutes: typeof d.etaMinutes === "number" && Number.isFinite(d.etaMinutes) ? Math.round(d.etaMinutes) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireCoordinator(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ref }, { data: unit }] = await Promise.all([
      supabaseAdmin.from("referrals").select("id, reference, status").eq("id", data.id).single(),
      supabaseAdmin.from("responder_units").select("id, call_sign, status").eq("id", data.unitId).single(),
    ]);
    if (!ref) throw new Error("Referral not found");
    if (!unit) throw new Error("Vehicle not found");
    if (ref.status !== "accepted" && ref.status !== "assigned") throw new Error("Referral must be accepted before a vehicle is assigned");

    // Double-booking block: the vehicle must not be on another open referral.
    const { data: clash } = await supabaseAdmin
      .from("referrals")
      .select("reference")
      .eq("unit_id", data.unitId)
      .not("status", "in", "(completed,cancelled,declined)")
      .neq("id", data.id)
      .maybeSingle();
    if (clash) throw new Error(`That vehicle is already assigned to referral ${clash.reference}`);

    const { error } = await supabaseAdmin
      .from("referrals")
      .update({
        unit_id: data.unitId,
        driver_name: data.driverName,
        driver_phone: data.driverPhone,
        crew: data.crew,
        provider: data.provider ?? undefined,
        total_distance_km: data.totalDistanceKm,
        route_polyline: data.routePolyline,
        eta_minutes: data.etaMinutes,
        status: "assigned",
      })
      .eq("id", data.id);
    if (error) throw error;
    await recordHistory(supabaseAdmin, data.id, "assigned", ctx.userId, `Vehicle ${unit.call_sign} assigned`);
    await notifyCoordinators(supabaseAdmin, "Ambulance assigned", `Vehicle ${unit.call_sign} assigned to referral ${ref.reference}.`, "info", data.id);
    await audit(supabaseAdmin, ctx.userId, "referral_unit_assigned", data.id, { reference: ref.reference, call_sign: unit.call_sign });
    return { ok: true };
  });

export const advanceReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; to: ReferralStatus; note?: string; handoverReceivedBy?: string; handoverNotes?: string }) => {
    return {
      id: String(d.id),
      to: d.to,
      note: d.note ? String(d.note).slice(0, 400) : null,
      handoverReceivedBy: d.handoverReceivedBy ? String(d.handoverReceivedBy).slice(0, 120) : null,
      handoverNotes: d.handoverNotes ? String(d.handoverNotes).slice(0, 400) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await requireStaff(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ref } = await supabaseAdmin.from("referrals").select("id, reference, status, unit_id").eq("id", data.id).single();
    if (!ref) throw new Error("Referral not found");
    const allowed = NEXT_STATUSES[ref.status as ReferralStatus] ?? [];
    if (!allowed.includes(data.to)) throw new Error(`Cannot move from ${ref.status} to ${data.to}`);
    if (data.to === "handover" && !data.handoverReceivedBy) throw new Error("Record who received the patient");
    // Only coordinators may cancel.
    if (data.to === "cancelled") await requireCoordinator(ctx);

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.to };
    if (data.to === "departed") patch.departed_at = now;
    if (data.to === "arrived") patch.arrived_at = now;
    if (data.to === "completed") patch.completed_at = now;

    const { error } = await supabaseAdmin.from("referrals").update(patch as never).eq("id", data.id);
    if (error) throw error;

    if (data.to === "handover") {
      await supabaseAdmin.from("referral_handover").insert({
        referral_id: data.id,
        received_by: data.handoverReceivedBy!,
        notes: data.handoverNotes,
        actor_id: ctx.userId,
      });
    }

    // Keep the vehicle's own status in step with the journey.
    if (ref.unit_id) {
      const unitStatus =
        data.to === "departed" || data.to === "en_route" || data.to === "approaching"
          ? "transporting"
          : data.to === "arrived" || data.to === "handover"
            ? "on_scene"
            : data.to === "completed" || data.to === "cancelled"
              ? "available"
              : null;
      if (unitStatus) await supabaseAdmin.from("responder_units").update({ status: unitStatus }).eq("id", ref.unit_id);
    }

    await recordHistory(supabaseAdmin, data.id, data.to, ctx.userId, data.note);
    const titles: Partial<Record<ReferralStatus, string>> = {
      departed: "Ambulance departed",
      en_route: "Ambulance en route",
      approaching: "Ambulance approaching destination",
      arrived: "Ambulance arrived",
      handover: "Patient handover recorded",
      completed: "Referral completed",
      cancelled: "Referral cancelled",
    };
    if (titles[data.to]) {
      await notifyCoordinators(supabaseAdmin, titles[data.to]!, `Referral ${ref.reference}: ${titles[data.to]!.toLowerCase()}.`, data.to === "cancelled" ? "warning" : "info", data.id);
    }
    await audit(supabaseAdmin, ctx.userId, `referral_${data.to}`, data.id, { reference: ref.reference });
    return { ok: true };
  });
