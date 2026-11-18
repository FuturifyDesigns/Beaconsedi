import { useMemo, useState } from "react";
import { Radio, X } from "lucide-react";
import { UNIT_KIND, UNIT_STATUS, distanceKm, estimateEta, type Incident, type Unit } from "@/lib/ops";
import { useTravelMatrix } from "@/hooks/useMaps";

type Props = {
  incident: Incident;
  units: Unit[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (unitId: string, note: string) => void;
};

/** Explicit unit selection + confirmation. A unit is never dispatched silently. */
export function DispatchDialog({ incident, units, busy, onClose, onConfirm }: Props) {
  const located = useMemo(
    () =>
      units
        .filter((u) => u.latitude != null && u.longitude != null)
        .map((u) => ({ id: u.id, lat: u.latitude as number, lng: u.longitude as number })),
    [units],
  );
  const { rows: drive } = useTravelMatrix(located, { lat: incident.latitude, lng: incident.longitude });

  const candidates = useMemo(() => {
    return units
      .map((u) => {
        const real = drive[u.id];
        const km = real?.ok
          ? real.distanceMeters / 1000
          : u.latitude != null && u.longitude != null
            ? distanceKm({ lat: incident.latitude, lng: incident.longitude }, { lat: u.latitude, lng: u.longitude })
            : null;
        const eta = real?.ok
          ? Math.max(1, Math.round(real.durationSeconds / 60))
          : km != null
            ? estimateEta(km, u.kind)
            : null;
        return { unit: u, km, eta, live: !!real?.ok };
      })
      .sort((a, b) => {
        const aOk = a.unit.status === "available" ? 0 : 1;
        const bOk = b.unit.status === "available" ? 0 : 1;
        if (aOk !== bOk) return aOk - bOk;
        return (a.eta ?? 1e9) - (b.eta ?? 1e9);
      });
  }, [units, drive, incident.latitude, incident.longitude]);


  const firstAvailable = candidates.find((c) => c.unit.status === "available");
  const [unitId, setUnitId] = useState<string | null>(firstAvailable?.unit.id ?? null);
  const [note, setNote] = useState("");

  const chosen = candidates.find((c) => c.unit.id === unitId) ?? null;
  const blocked =
    chosen && chosen.unit.status !== "available"
      ? `Unable to dispatch ${chosen.unit.call_sign} — the unit is currently ${UNIT_STATUS[chosen.unit.status]?.label.toLowerCase() ?? chosen.unit.status}. Select an available unit.`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" role="dialog" aria-modal="true" aria-label="Confirm dispatch">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Dispatch a unit</h2>
            <p className="text-[11px] text-muted-foreground">
              {incident.incident_code ?? incident.id.slice(0, 8)} · {incident.incident_type.replace(/_/g, " ")} · {incident.priority.toUpperCase()}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dispatch dialog" className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {candidates.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No responder units are registered yet. Add units before dispatching.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5" role="radiogroup" aria-label="Available units">
            {candidates.map(({ unit, km, eta, live }) => {
              const s = UNIT_STATUS[unit.status] ?? UNIT_STATUS.offline;
              const selectable = unit.status === "available";
              return (
                <li key={unit.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={unitId === unit.id}
                    onClick={() => setUnitId(unit.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition ${
                      unitId === unit.id ? "border-emergency bg-emergency/5" : "border-border hover:bg-accent"
                    } ${selectable ? "" : "opacity-60"}`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold">
                      {UNIT_KIND[unit.kind]?.glyph ?? "U"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">
                        {unit.call_sign} · {unit.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {UNIT_KIND[unit.kind]?.label ?? unit.kind}
                        {unit.vehicle ? ` · ${unit.vehicle}` : ""}
                        {km != null ? ` · ${km.toFixed(1)} km` : " · location unknown"}
                        {eta != null ? ` · ETA ${eta} min${live ? " (traffic)" : " (est.)"}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.chip}`}>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <label className="mt-3 block text-[11px] font-medium text-muted-foreground">
          Dispatch note to the responder (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={400}
            className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Access notes, hazards, patient condition…"
          />
        </label>

        {blocked && (
          <p role="alert" className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
            {blocked}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent">
            Cancel
          </button>
          <button
            type="button"
            disabled={!unitId || !!blocked || busy}
            onClick={() => unitId && onConfirm(unitId, note.trim())}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emergency px-3 text-xs font-bold text-emergency-foreground disabled:opacity-40"
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? "Dispatching…" : `Confirm dispatch${chosen ? ` · ${chosen.unit.call_sign}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
