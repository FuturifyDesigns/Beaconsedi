import { INCIDENT_STATUS, PRIORITY_META, distanceKm, sincePretty, type Incident } from "@/lib/ops";
import {
  ACTION_META, LIFECYCLE_STAGES, availableActions, nextAction, stageIndex, stageOf,
  type LifecycleAction,
} from "@/lib/incident-lifecycle";
import { NavigateButton } from "@/components/NavigateButton";
import { Phone, Radio, ShieldAlert, CheckCircle2, ArrowUpCircle, MapPin, Ambulance } from "lucide-react";

type Props = {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAction: (incident: Incident, action: LifecycleAction) => void;
  origin: { lat: number; lng: number } | null;
  busy?: boolean;
};

const ACTION_ICON: Record<LifecycleAction, React.ComponentType<{ className?: string }>> = {
  acknowledge: ShieldAlert,
  dispatch: Radio,
  arrive: MapPin,
  transport: Ambulance,
  resolve: CheckCircle2,
  escalate: ArrowUpCircle,
};

const STAGE_LABEL: Record<string, string> = {
  active: "SOS",
  acknowledged: "Ack",
  dispatched: "Dispatched",
  on_scene: "On scene",
  transporting: "Transport",
  resolved: "Closed",
};

export function SosFeed({ incidents, selectedId, onSelect, onAction, origin, busy }: Props) {
  if (!incidents.length) {
    return <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No active SOS alerts.</p>;
  }

  return (
    <ul className="space-y-3" aria-label="Incoming SOS alerts">
      {incidents.map((i) => {
        const prio = PRIORITY_META[i.priority] ?? PRIORITY_META.high;
        const status = INCIDENT_STATUS[i.status] ?? INCIDENT_STATUS.active;
        const km = origin ? distanceKm(origin, { lat: i.latitude, lng: i.longitude }) : null;
        const selected = i.id === selectedId;
        const stage = stageOf(i);
        const current = stageIndex(stage);
        const actions = availableActions(i);
        const suggested = nextAction(i);
        return (
          <li key={i.id}>
            <article
              className={`rounded-xl border bg-card p-4 transition motion-reduce:transition-none ${
                selected ? "border-emergency ring-1 ring-emergency/40" : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <button type="button" onClick={() => onSelect(i.id)} className="w-full text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${prio.chip}`}>
                    {i.priority === "critical" && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emergency motion-reduce:animate-none" aria-hidden="true" />
                    )}
                    {prio.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">{i.incident_code ?? "—"}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.chip}`}>{status.label}</span>
                </div>
                <h3 className="mt-2 text-sm font-bold">{i.patient_name ?? "Anonymous patient"}</h3>
                <p className="line-clamp-2 text-xs text-muted-foreground">{i.message ?? i.incident_type.replace(/_/g, " ")}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                  <div><dt className="sr-only">Time received</dt><dd className="tabular-nums">{sincePretty(i.created_at)} ago</dd></div>
                  <div><dt className="sr-only">Distance</dt><dd className="tabular-nums">{km != null ? `${km.toFixed(1)} km` : "—"}</dd></div>
                  <div><dt className="sr-only">GPS accuracy</dt><dd className="tabular-nums">±{i.accuracy ? Math.round(i.accuracy) : "?"} m</dd></div>
                </dl>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  <span className="font-mono">{i.latitude.toFixed(5)}, {i.longitude.toFixed(5)}</span>
                  <span className="mx-1.5">·</span>
                  Last updated {sincePretty(i.updated_at)} ago
                </p>
              </button>

              <ol className="mt-3 flex items-center gap-1" aria-label={`Lifecycle stage: ${STAGE_LABEL[stage]}`}>
                {LIFECYCLE_STAGES.map((s, idx) => (
                  <li key={s} className="flex flex-1 flex-col items-center gap-1">
                    <span
                      className={`h-1 w-full rounded-full ${
                        idx < current ? "bg-success/70" : idx === current ? "bg-emergency" : "bg-muted"
                      }`}
                      aria-hidden="true"
                    />
                    <span className={`text-[9px] uppercase tracking-wide ${idx === current ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                      {STAGE_LABEL[s]}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-3 flex flex-wrap gap-2">
                {actions.map((a) => (
                  <ActionBtn
                    key={a}
                    onClick={() => onAction(i, a)}
                    icon={ACTION_ICON[a]}
                    label={ACTION_META[a].label}
                    tone={a === suggested ? "primary" : ACTION_META[a].tone}
                    disabled={busy}
                  />
                ))}
                <NavigateButton incidentId={i.id} />
                {i.patient_phone && (
                  <a
                    href={`tel:${i.patient_phone}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
                  </a>
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function ActionBtn({
  onClick, icon: Icon, label, tone, disabled,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "neutral" | "primary" | "warning" | "success" | "emergency";
  disabled?: boolean;
}) {
  const cls =
    tone === "primary" ? "bg-emergency text-emergency-foreground hover:opacity-90"
    : tone === "warning" ? "bg-warning text-warning-foreground hover:opacity-90"
    : tone === "success" ? "bg-success text-success-foreground hover:opacity-90"
    : tone === "emergency" ? "border border-emergency/50 text-emergency hover:bg-emergency/10"
    : "border border-border bg-background hover:bg-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}
