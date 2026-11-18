import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "patient" | "responder" | "crew" | "admin" | "hospital" | "operator";

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !!data;
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context.supabase, context.userId);
    return { isAdmin: admin };
  });

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersErr) throw usersErr;
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw rolesErr;
    const byUser = new Map<string, Role[]>();
    (roles ?? []).forEach((r) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role as Role);
      byUser.set(r.user_id, arr);
    });
    return usersData.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      roles: byUser.get(u.id) ?? [],
    }));
  });

/** Admin-only fleet list, including the responder currently assigned to each unit. */
export const listVehicleAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: units, error: unitsError }, { data: profiles, error: profilesError }] = await Promise.all([
      supabaseAdmin
        .from("responder_units")
        .select("id, name, call_sign, kind, status, user_id")
        .order("call_sign"),
      supabaseAdmin
        .from("responder_profiles")
        .select("user_id, assigned_unit_id"),
    ]);
    if (unitsError) throw unitsError;
    if (profilesError) throw profilesError;
    const assignedByUnit = new Map(
      (profiles ?? []).filter((profile) => profile.assigned_unit_id).map((profile) => [profile.assigned_unit_id, profile.user_id]),
    );
    return (units ?? []).map((unit) => ({
      ...unit,
      assigned_user_id: unit.user_id ?? assignedByUnit.get(unit.id) ?? null,
    }));
  });

const VEHICLE_KINDS = ["ambulance", "police", "fire", "rescue", "air"] as const;
type VehicleInput = {
  name: string;
  callSign: string;
  kind: (typeof VEHICLE_KINDS)[number];
  vehicle?: string;
  registrationNumber?: string;
  phone?: string;
};

/** Admin-only: register a new vehicle in the fleet. */
export const createVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: VehicleInput) => {
    const name = String(d.name ?? "").trim().slice(0, 80);
    const callSign = String(d.callSign ?? "").trim().toUpperCase().slice(0, 20);
    if (!name || !callSign) throw new Error("Name and call sign are required");
    if (!VEHICLE_KINDS.includes(d.kind)) throw new Error("Invalid vehicle type");
    const opt = (v?: string) => (v ? String(v).trim().slice(0, 80) || null : null);
    return { name, callSign, kind: d.kind, vehicle: opt(d.vehicle), registrationNumber: opt(d.registrationNumber), phone: opt(d.phone) };
  })
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dup } = await supabaseAdmin.from("responder_units").select("id").ilike("call_sign", data.callSign).maybeSingle();
    if (dup) throw new Error("A vehicle with that call sign already exists");
    const { data: row, error } = await supabaseAdmin
      .from("responder_units")
      .insert({
        name: data.name,
        call_sign: data.callSign,
        kind: data.kind,
        vehicle: data.vehicle,
        registration_number: data.registrationNumber,
        phone: data.phone,
      })
      .select("id")
      .single();
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "vehicle_created",
      target_type: "responder_unit",
      target_id: row.id,
      metadata: { call_sign: data.callSign, kind: data.kind },
    });
    return { ok: true, id: row.id };
  });

export const assignVehicleToResponder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; email: string; unitId: string | null }) => data)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { error } = await context.supabase.rpc("admin_assign_responder_vehicle", {
      _user_id: data.userId,
      _email: data.email,
      ...(data.unitId ? { _unit_id: data.unitId } : {}),
    });
    if (error) {
      if (error.message.toLowerCase().includes("already assigned")) {
        throw new Error("That vehicle is already assigned to another responder");
      }
      throw error;
    }
    return { ok: true };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Forbidden");
    if (data.userId === context.userId && data.role === "admin") {
      throw new Error("You cannot revoke your own admin role");
    }
    if (data.role === "responder" || data.role === "crew") {
      const { error: assignmentError } = await context.supabase.rpc("admin_assign_responder_vehicle", {
        _user_id: data.userId,
        _email: "",
      });
      if (assignmentError) throw assignmentError;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);
    if (error) throw error;
    return { ok: true };
  });
