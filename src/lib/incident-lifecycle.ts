import { supabase } from "@/integrations/supabase/client";
import { estimateEta, distanceKm, logAudit, logEvent, nearestUnit, type Incident, type Unit } from "@/lib/ops";

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
  if (stage === "resolved") return false;
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

const EVENT_FOR: Record<LifecycleAction, string> = {
  acknowledge: "responder_accepted",
  dispatch: "unit_dispatched",
  arrive: "arrived_on_scene",
  transport: "patient_loaded",
  resolve: "incident_closed",
  escalate: "escalated",
};

/**
 * Applies one lifecycle transition: validates it, writes the alert row,
 * keeps the assigned unit in sync, appends a timeline event and an audit entry.
 */
export async function applyIncidentAction(incident: Incident, action: LifecycleAction, ctx: Ctx) {
  if (!canRunAction(incident, action)) {
    throw new Error(`Cannot ${ACTION_META[action].label.toLowerCase()} an incident that is ${stageOf(incident).replace(/_/g, " ")}`);
  }

  let note: string | null = ctx.note ?? null;
  const alertPatch: Record<string, unknown> = { responder_id: incident.responder_id ?? ctx.userId };

  if (action === "escalate") {
    alertPatch['priority'] = "critical";
    note = note ?? `Escalated by ${ctx.actorName ?? "responder"}`;
  } else {
    alertPatch['status'] = ACTION_TARGET[action];
  }

  if (action === "acknowledge") {
    alertPatch['responder_id'] = ctx.userId;
    note = note ?? ctx.actorName ?? null;
  }

  let unitId = incident.assigned_unit_id;
  let eta = incident.eta_minutes;

  if (action === "dispatch") {
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
    alertPatch['assigned_unit_id'] = unitId;
    alertPatch['eta_minutes'] = eta;
    note = note ?? (eta != null ? `ETA ${eta} min` : null);
  }

  if (action === "resolve") {
    alertPatch['resolved_at'] = new Date().toISOString();
    alertPatch['eta_minutes'] = null;
  }

  const { error } = await supabase.from("alerts").update(alertPatch as never).eq("id", incident.id);
  if (error) throw error;

  // Keep the assigned unit's status aligned with the incident stage.
  const unitPatch: Record<string, unknown> | null =
    action === "dispatch"
      ? { status: "en_route", current_alert_id: incident.id, eta_minutes: eta }
      : action === "arrive"
        ? { status: "on_scene", current_alert_id: incident.id, eta_minutes: null }
        : action === "transport"
          ? { status: "transporting", current_alert_id: incident.id }
          : action === "resolve"
            ? { status: "available", current_alert_id: null, eta_minutes: null }
            : null;

  if (unitPatch && unitId) {
    const { error: unitError } = await supabase.from("responder_units").update(unitPatch as never).eq("id", unitId);
    if (unitError) throw unitError;
  }

  await logEvent(incident.id, EVENT_FOR[action], note ?? undefined);
  await logAudit(`incident_${action}`, "alert", incident.id, {
    from: incident.status,
    to: action === "escalate" ? incident.status : ACTION_TARGET[action],
    unit_id: unitId,
  });


  return { unitId, eta };
}
