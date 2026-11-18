import { clock, EVENT_LABEL, type IncidentEvent } from "@/lib/ops";

type Props = { events: IncidentEvent[]; loading: boolean; incidentCode: string | null };

export function TimelinePanel({ events, loading, incidentCode }: Props) {
  if (!incidentCode) return <p className="p-4 text-xs text-muted-foreground">Select an incident to view its timeline.</p>;
  if (loading) {
    return (
      <div className="space-y-2 p-1" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }
  if (!events.length) return <p className="p-4 text-xs text-muted-foreground">No timeline entries yet for {incidentCode}.</p>;

  return (
    <ol className="relative space-y-3 border-l border-border pl-4" aria-label={`Timeline for ${incidentCode}`}>
      {events.map((e, idx) => (
        <li key={e.id} className="relative animate-in fade-in slide-in-from-left-1 duration-300">
          <span
            className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card ${idx === 0 ? "bg-emergency" : "bg-muted-foreground"}`}
            aria-hidden="true"
          />
          <p className="text-xs font-semibold">{EVENT_LABEL[e.event_type] ?? e.event_type.replace(/_/g, " ")}</p>
          {e.note && <p className="text-[11px] text-muted-foreground">{e.note}</p>}
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums">{clock(e.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
