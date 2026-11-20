import { supabase } from "@/integrations/supabase/client";
import { estimateEta, distanceKm, nearestUnit, type Incident, type Unit } from "@/lib/ops";

/* ------------------------------- state model ------------------------------ */

export const LIFECYCLE_STAGES = ["active", "acknowledged", "dispatched", "on_scene", "transporting", "resolved"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export type LifecycleAction = "acknowledge" | "dispatch" | "arrive" | "transport" | "resolve" | "escalate";

/** Target stage produced by each action (escalate keeps the stage, raises priority). */
export const ACTION_TARGET: Record<Exclude<LifecycleAction, "escalate">, LifecycleStage> = {
  acknowledge: "acknowledged",
  dispatch: "dispatched",
  arrive: "on_scene",
  transport: "transporting",
  resolve: "resolved",
};

/** Allowed forward transitions. Resolve is reachable from any open stage. */
export const ALLOWED_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  active: ["acknowledged", "dispatched", "resolved"],
  acknowledged: ["dispatched", "resolved"],
  dispatched: ["on_scene", "resolved"],
  on_scene: ["transporting", "resolved"],
  transporting: ["resolved"],
  resolved: [],
};

export const ACTION_META: Record<LifecycleAction, { label: string; done: string; tone: "neutral" | "warning" | "success" | "emergency" }> = {
  acknowledge: { label: "Acknowledge", done: "Incident acknowledged", tone: "neutral" },
  dispatch: { label: "Dispatch", done: "Unit dispatched", tone: "warning" },
  arrive: { label: "On scene", done: "Marked on scene", tone: "neutral" },
  transport: { label: "Transporting", done: "Transport started", tone: "neutral" },
  resolve: { label: "Resolve", done: "Incident closed", tone: "success" },
  escalate: { label: "Escalate", done: "Incident escalated", tone: "emergency" },
};

export function stageOf(incident: Pick<Incident, "status">): LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(incident.status)
    ? (incident.status as LifecycleStage)
    : "active";
}

export function stageIndex(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

export function canRunAction(incident: Pick<Incident, "status" | "priority">, action: LifecycleAction): boolean {
  const stage = stageOf(incident);
  if (incident.status === "resolved" || incident.status === "cancelled") return false;
  if (action === "escalate") return incident.priority !== "critical";
  return ALLOWED_TRANSITIONS[stage].includes(ACTION_TARGET[action]);
}

export function availableActions(incident: Pick<Incident, "status" | "priority">): LifecycleAction[] {
  return (Object.keys(ACTION_META) as LifecycleAction[]).filter((a) => canRunAction(incident, a));
}

/** The single action a dispatcher should take next, if any. */
export function nextAction(incident: Pick<Incident, "status" | "priority">): LifecycleAction | null {
  const order: LifecycleAction[] = ["acknowledge", "dispatch", "arrive", "transport", "resolve"];
  return order.find((a) => canRunAction(incident, a)) ?? null;
}

export function navigationUrl(incident: Pick<Incident, "latitude" | "longitude">): string {
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${incident.latitude},${incident.longitude}`;
}

/* ------------------------------- transitions ------------------------------ */

type Ctx = {
  userId: string;
  actorName?: string | null;
  units?: Unit[];
  preferredUnitId?: string | null;
  note?: string | null;
};

/**
 * Applies one lifecycle transition: validates it, writes the alert row,
 * keeps the assigned unit in sync, appends a timeline event and an audit entry.
 */
export async function applyIncidentAction(incident: Incident, action: LifecycleAction, ctx: Ctx) {
  if (!canRunAction(incident, action)) {
    throw new Error(`Cannot ${ACTION_META[action].label.toLowerCase()} an incident that is ${stageOf(incident).replace(/_/g, " ")}`);
  }

  const note = ctx.note ?? null;
  let unitId = incident.assigned_unit_id;
  let eta = incident.eta_minutes;

  if (action === "dispatch") {
    const { data: admin, error: roleError } = await supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (roleError) throw roleError;
    if (!admin) {
      const { error } = await supabase.rpc("accept_crew_incident" as never, { _alert_id: incident.id } as never);
      if (error) throw new Error(error.message);
      return;
    }
    const units = ctx.units ?? [];
    const preferred = ctx.preferredUnitId ? units.find((u) => u.id === ctx.preferredUnitId) : undefined;
    const match = nearestUnit(incident, units);
    if (preferred) {
      unitId = preferred.id;
      eta =
        preferred.latitude != null && preferred.longitude != null
          ? estimateEta(
              distanceKm({ lat: incident.latitude, lng: incident.longitude }, { lat: preferred.latitude, lng: preferred.longitude }),
              preferred.kind,
            )
          : (match?.eta ?? null);
    } else if (match) {
      unitId = match.unit.id;
      eta = match.eta;
    }
    if (!unitId) throw new Error("No available unit to dispatch");
    const { error } = await supabase.rpc("dispatch_incident", {
      _alert_id: incident.id, _unit_id: unitId, _eta: eta, _note: note,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.rpc("transition_incident" as never, { _alert_id: incident.id, _action: action, _note: note } as never);
  if (error) throw error;
  return { unitId, eta };
}
