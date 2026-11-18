import { useState } from "react";
import { ChevronDown, ChevronUp, Navigation2, Timer } from "lucide-react";
import type { RouteResult } from "@/lib/maps.functions";
import { useEtaCountdown } from "@/hooks/useMaps";

type Props = {
  route: RouteResult | null;
  loading?: boolean;
  title?: string;
};

/** Live ETA countdown + turn-by-turn directions for the active response route. */
export function RoutePanel({ route, loading = false, title = "Active route" }: Props) {
  const [open, setOpen] = useState(false);
  const { label } = useEtaCountdown(route ? route.durationSeconds : null);

  if (!route) {
    return loading ? (
      <p className="rounded-lg border border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground">Calculating route…</p>
    ) : null;
  }

  const km = (route.distanceMeters / 1000).toFixed(1);

  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Navigation2 className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
          <span className="block truncate text-xs text-foreground">{route.summary ?? `${km} km`}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-sky-300" aria-live="polite">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          {label ?? "--:--"}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      </button>

      {open && (
        <ol className="max-h-56 space-y-1 overflow-y-auto border-t border-border px-3 py-2 text-[11px]">
          {route.steps.length === 0 && <li className="text-muted-foreground">No turn-by-turn steps available.</li>}
          {route.steps.map((s, i) => (
            <li key={`${i}-${s.instruction}`} className="flex gap-2">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-secondary text-[9px] font-bold">{i + 1}</span>
              <span className="min-w-0 flex-1 text-foreground">
                {s.instruction}
                <span className="ml-1 text-muted-foreground">
                  · {s.distanceMeters >= 1000 ? `${(s.distanceMeters / 1000).toFixed(1)} km` : `${Math.round(s.distanceMeters)} m`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
