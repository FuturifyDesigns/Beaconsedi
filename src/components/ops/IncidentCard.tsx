import { ArrowUpRight, Ambulance, CheckCircle2, Clock, Eye, MapPin, PhoneCall, Send, ShieldAlert } from "lucide-react";
import {
  INCIDENT_STATUS, PRIORITY_META, sincePretty, type Incident, type Unit,
} from "@/lib/ops";
import {
  ACTION_META, LIFECYCLE_STAGES, availableActions, nextAction, stageIndex, stageOf, type LifecycleAction,
} from "@/lib/incident-lifecycle";
import { NavigateButton } from "@/components/NavigateButton";

type Props = {
  incident: Incident;
  unit: Unit | null;
  selected: boolean;
  onSelect: () => void;
  onAction: (action: LifecycleAction) => void;
  busy: boolean;
};

const ICON: Record<LifecycleAction, typeof Eye> = {
  acknowledge: ShieldAlert,
  dispatch: Send,
  arrive: MapPin,
  transport: Ambulance,
  resolve: CheckCircle2,
  escalate: ArrowUpRight,
};

const STAGE_LABEL: Record<string, string> = {
  active: "SOS",
  acknowledged: "Ack",
  dispatched: "Dispatched",
  on_scene: "On scene",
  transporting: "Transport",
  resolved: "Closed",
};

export function IncidentCard({ incident, unit, selected, onSelect, onAction, busy }: Props) {
  const p = PRIORITY_META[incident.priority] ?? PRIORITY_META.high;
  const s = INCIDENT_STATUS[incident.status] ?? INCIDENT_STATUS.active;
  const stage = stageOf(incident);
  const current = stageIndex(stage);
  const actions = availableActions(incident);
  const suggested = nextAction(incident);

  return (
    <article
      aria-current={selected ? "true" : undefined}
      className={`rounded-xl border bg-card p-3 transition-all duration-200 ${
        selected ? "border-emergency/60 shadow-[0_0_0_1px_var(--emergency)]" : "border-border hover:border-muted-foreground/40"
      }`}
    >

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${p.chip}`}>{p.label}</span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">{incident.incident_code ?? incident.id.slice(0, 8)}</span>
          </div>
          <h3 className="mt-1 truncate text-sm font-bold">
            {incident.patient_name?.trim() || "Anonymous patient"}
            <span className="ml-2 font-normal capitalize text-muted-foreground">{incident.incident_type.replace(/_/g, " ")}</span>
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular-nums">{sincePretty(incident.created_at)}</span>
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="col-span-2 flex min-w-0 items-center gap-1 text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate font-mono">
            {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
            {incident.accuracy ? ` ±${Math.round(incident.accuracy)}m` : ""}
          </span>
        </div>
        <div className="col-span-2 text-[10px] text-muted-foreground">
          Last updated {sincePretty(incident.updated_at)} ago
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Assigned</dt>
          <dd className="truncate font-medium">{unit ? `${unit.call_sign} · ${unit.name}` : "Unassigned"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">ETA</dt>
          <dd className="font-medium tabular-nums">{incident.eta_minutes != null ? `${incident.eta_minutes} min` : "—"}</dd>
        </div>
      </dl>

      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${incident.status === "active" ? "animate-pulse" : ""}`} aria-hidden="true" />
          {s.label}
        </span>
      </div>

      <ol className="mt-2 flex items-center gap-1" aria-label={`Lifecycle stage: ${STAGE_LABEL[stage]}`}>
        {LIFECYCLE_STAGES.map((st, idx) => (
          <li key={st} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={`h-1 w-full rounded-full ${idx < current ? "bg-success/70" : idx === current ? "bg-emergency" : "bg-muted"}`}
              aria-hidden="true"
            />
            <span className={`text-[9px] uppercase tracking-wide ${idx === current ? "font-bold text-foreground" : "text-muted-foreground"}`}>
              {STAGE_LABEL[st]}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Action label="View" icon={Eye} onClick={onSelect} />
        {actions.map((a) => (
          <Action
            key={a}
            label={ACTION_META[a].label}
            icon={ICON[a]}
            onClick={() => onAction(a)}
            disabled={busy}
            {...(a === suggested ? { tone: "primary" as const } : {})}
          />
        ))}
        <NavigateButton incidentId={incident.id} compact />
        {incident.patient_phone && (
          <a
            href={`tel:${incident.patient_phone}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" /> Call
          </a>
        )}
      </div>

    </article>
  );
}

function Action({
  label, icon: Icon, onClick, disabled, tone,
}: { label: string; icon: typeof Eye; onClick: () => void; disabled?: boolean; tone?: "primary" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition disabled:opacity-40 ${
        tone === "primary"
          ? "border-emergency bg-emergency text-emergency-foreground hover:opacity-90"
          : "border-border text-foreground hover:bg-accent"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}
