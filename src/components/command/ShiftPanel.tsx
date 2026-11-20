import { SHIFT_EVENT_LABEL, formatDuration, workedSeconds, type Shift, type ShiftEvent } from "@/lib/responder";
import { clock as clockLabel } from "@/lib/ops";
import { Coffee, LogIn, LogOut, Play } from "lucide-react";
import { useTicker } from "@/hooks/useTracking";

type Props = {
  shift: Shift | null;
  events: ShiftEvent[];
  history: Shift[];
  busy: boolean;
  onClockIn: () => void;
  onClockOut: () => void;
  onBreakStart: () => void;
  onBreakEnd: () => void;
};

export function ShiftPanel({ shift, events, history, busy, onClockIn, onClockOut, onBreakStart, onBreakEnd }: Props) {
  useTicker(1000);
  const onBreak = !!shift?.break_started_at;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current shift</p>
            <p className="text-2xl font-bold tabular-nums">{shift ? formatDuration(workedSeconds(shift)) : "Off duty"}</p>
            <p className="text-[11px] text-muted-foreground">
              {shift ? `Started ${clockLabel(shift.started_at)}${onBreak ? " · on break" : ""}` : "Clock in to begin your shift"}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {!shift ? (
              <button type="button" disabled={busy} onClick={onClockIn} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-success px-4 text-sm font-semibold text-success-foreground disabled:opacity-60">
                <LogIn className="h-4 w-4" aria-hidden="true" /> Clock in
              </button>
            ) : (
              <>
                {onBreak ? (
                  <button type="button" disabled={busy} onClick={onBreakEnd} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-sm font-semibold text-white disabled:opacity-60">
                    <Play className="h-4 w-4" aria-hidden="true" /> End break
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={onBreakStart} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-warning px-3 text-sm font-semibold text-warning-foreground disabled:opacity-60">
                    <Coffee className="h-4 w-4" aria-hidden="true" /> Start break
                  </button>
                )}
                <button type="button" disabled={busy} onClick={onClockOut} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emergency px-3 text-sm font-semibold text-emergency-foreground disabled:opacity-60">
                  <LogOut className="h-4 w-4" aria-hidden="true" /> Clock out
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{shift ? "Current shift timeline" : "Latest shift timeline"}</h3>
          {!events.length ? (
            <p className="text-xs text-muted-foreground">No shift activity yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border pl-4">
              {events.map((e, idx) => (
                <li key={e.id} className="relative">
                  <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card ${idx === 0 ? "bg-emergency" : "bg-muted-foreground"}`} aria-hidden="true" />
                  <p className="text-xs font-semibold">{SHIFT_EVENT_LABEL[e.event_type] ?? e.event_type}</p>
                  {e.note && <p className="text-[11px] text-muted-foreground">{e.note}</p>}
                  <p className="text-[10px] uppercase tabular-nums text-muted-foreground">{clockLabel(e.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shift history</h3>
          {!history.length ? (
            <p className="text-xs text-muted-foreground">No previous shifts.</p>
          ) : (
            <table className="w-full text-xs">
              <caption className="sr-only">Recent shifts with hours worked</caption>
              <thead>
                <tr className="text-left text-[10px] uppercase text-muted-foreground">
                  <th scope="col" className="pb-2">Date</th>
                  <th scope="col" className="pb-2">Start</th>
                  <th scope="col" className="pb-2">End</th>
                  <th scope="col" className="pb-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-1.5">{new Date(s.started_at).toLocaleDateString()}</td>
                    <td className="py-1.5 tabular-nums">{clockLabel(s.started_at)}</td>
                    <td className="py-1.5 tabular-nums">{s.ended_at ? clockLabel(s.ended_at) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatDuration(workedSeconds(s))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
