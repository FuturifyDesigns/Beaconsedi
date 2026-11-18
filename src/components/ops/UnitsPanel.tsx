import { Ambulance, Flame, Plane, Shield, Wrench } from "lucide-react";
import { UNIT_KIND, UNIT_STATUS, type Incident, type Unit } from "@/lib/ops";

const ICONS: Record<string, typeof Ambulance> = {
  ambulance: Ambulance,
  police: Shield,
  fire: Flame,
  rescue: Wrench,
  air: Plane,
};

type Props = { units: Unit[]; incidents: Incident[]; onFocusIncident: (id: string) => void };

export function UnitsPanel({ units, incidents, onFocusIncident }: Props) {
  return (
    <ul className="space-y-2" aria-label="Responder units">
      {units.length === 0 && <li className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No units registered.</li>}
      {units.map((u) => {
        const kind = UNIT_KIND[u.kind] ?? { label: u.kind, glyph: "?", hex: "#64748b" };
        const st = UNIT_STATUS[u.status] ?? UNIT_STATUS.offline;
        const Icon = ICONS[u.kind] ?? Ambulance;
        const assignment = incidents.find((i) => i.id === u.current_alert_id);
        return (
          <li key={u.id} className="rounded-xl border border-border bg-card p-3">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: `${kind.hex}22`, color: kind.hex }}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {u.call_sign} <span className="font-normal text-muted-foreground">· {u.name}</span>
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {kind.label}
                  {u.vehicle ? ` · ${u.vehicle}` : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.chip}`}>
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${st.dot}`} aria-hidden="true" />
                {st.label}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Location</dt>
                <dd className="truncate font-mono">
                  {u.latitude != null && u.longitude != null ? `${u.latitude.toFixed(3)}, ${u.longitude.toFixed(3)}` : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Assignment</dt>
                <dd className="truncate font-medium">
                  {assignment ? (
                    <button type="button" onClick={() => onFocusIncident(assignment.id)} className="text-emergency underline-offset-2 hover:underline">
                      {assignment.incident_code ?? assignment.id.slice(0, 8)}
                    </button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ETA</dt>
                <dd className="font-medium tabular-nums">{u.eta_minutes != null ? `${u.eta_minutes} min` : "—"}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
