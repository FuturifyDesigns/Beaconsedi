import { AVAILABILITY, CERT_LEVELS, initials, type ResponderProfile } from "@/lib/responder";
import type { Unit } from "@/lib/ops";

type Props = { team: ResponderProfile[]; units: Unit[] };

export function TeamPanel({ team, units }: Props) {
  if (!team.length) {
    return <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No responder profiles on record yet.</p>;
  }
  const unitById = new Map(units.map((u) => [u.id, u]));

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Team members on duty">
      {team.map((r) => {
        const avail = AVAILABILITY[r.availability] ?? AVAILABILITY.offline;
        const unit = r.assigned_unit_id ? unitById.get(r.assigned_unit_id) : undefined;
        const online = r.availability !== "offline";
        return (
          <li key={r.id} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
              {r.photo_url ? <img src={r.photo_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials(r.full_name)}
              <span
                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-card ${online ? "bg-success" : "bg-muted-foreground"}`}
                aria-label={online ? "Online" : "Offline"}
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.full_name ?? "Unnamed responder"}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {CERT_LEVELS[r.certification_level] ?? r.certification_level}
                {r.rank ? ` · ${r.rank}` : ""}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{unit ? `${unit.call_sign} · ${unit.name}` : "No vehicle assigned"}</p>
              <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${avail.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${avail.dot}`} aria-hidden="true" /> {avail.label}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
