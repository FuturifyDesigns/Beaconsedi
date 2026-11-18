import { DIVERSION, type Hospital } from "@/lib/ops";

function Capacity({ label, available, total }: { label: string; available: number; total: number }) {
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  const tone = pct === 0 ? "bg-emergency" : pct < 30 ? "bg-warning" : "bg-success";
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-xs font-bold tabular-nums">
          {available}
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={available}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${label} available`}
      >
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HospitalsPanel({ hospitals }: { hospitals: Hospital[] }) {
  return (
    <ul className="space-y-2" aria-label="Hospital capacity">
      {hospitals.length === 0 && (
        <li className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No hospitals configured.</li>
      )}
      {hospitals.map((h) => {
        const d = DIVERSION[h.diversion_status] ?? DIVERSION.open;
        return (
          <li key={h.id} className="rounded-xl border border-border bg-card p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{h.name}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${d.chip}`}>
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${d.dot}`} aria-hidden="true" />
                {d.label}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <Capacity label="Trauma beds" available={h.trauma_beds_available} total={h.trauma_beds_total} />
              <Capacity label="ICU" available={h.icu_available} total={h.icu_total} />
              <Capacity label="Theatres" available={h.theatres_available} total={h.theatres_total} />
              <Capacity label="Amb. bays" available={h.ambulance_bays_available} total={h.ambulance_bays_total} />
            </div>
            {h.phone && (
              <a href={`tel:${h.phone}`} className="mt-2 inline-block text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {h.phone}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
