import { Search, X } from "lucide-react";

export const INCIDENT_FILTERS = [
  "all", "active", "critical", "unassigned", "dispatched", "on_scene", "transporting", "resolved",
] as const;
export type IncidentFilter = (typeof INCIDENT_FILTERS)[number];

const LABEL: Record<IncidentFilter, string> = {
  all: "All",
  active: "Active",
  critical: "Critical",
  unassigned: "Unassigned",
  dispatched: "Dispatched",
  on_scene: "On scene",
  transporting: "Transporting",
  resolved: "Resolved",
};

type Props = {
  filter: IncidentFilter;
  onFilter: (f: IncidentFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  counts: Partial<Record<IncidentFilter, number>>;
  showTest: boolean;
  onToggleTest: () => void;
};

export function IncidentFilters({ filter, onFilter, query, onQuery, counts, showTest, onToggleTest }: Props) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input maxLength={400}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search incident ID, patient, location, unit, status…"
          aria-label="Search incidents"
          className="min-h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Incident filters">
        {INCIDENT_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => onFilter(f)}
            className={`min-h-8 rounded-full px-2.5 text-[11px] font-medium transition ${
              filter === f ? "bg-secondary text-secondary-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {LABEL[f]}
            {counts[f] != null && <span className="ml-1 tabular-nums opacity-70">{counts[f]}</span>}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={showTest}
          onClick={onToggleTest}
          className={`ml-auto min-h-8 rounded-full px-2.5 text-[11px] font-semibold transition ${
            showTest ? "bg-warning/20 text-warning ring-1 ring-warning/50" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {showTest ? "Test incidents shown" : "Test incidents hidden"}
        </button>
      </div>
    </div>
  );
}
