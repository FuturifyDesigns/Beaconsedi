import { clock } from "@/lib/ops";
import type { Notification } from "@/lib/responder";
import { BellRing, Check } from "lucide-react";

type Props = { notifications: Notification[]; onRead: (id: string) => void; onReadAll: () => void };

const SEVERITY: Record<string, string> = {
  critical: "border-l-emergency",
  warning: "border-l-warning",
  success: "border-l-success",
  info: "border-l-sky-400",
};

export function NotificationsPanel({ notifications, onRead, onReadAll }: Props) {
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <span className="rounded-full bg-emergency/10 px-2 py-0.5 text-[11px] font-semibold text-emergency">{unread} unread</span>
        {!!unread && (
          <button type="button" onClick={onReadAll} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
          </button>
        )}
      </div>

      {!notifications.length ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border border-l-4 border-border bg-card p-3 ${SEVERITY[n.severity] ?? SEVERITY.info} ${n.read_at ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-2">
                <BellRing className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{n.title}</p>
                  {n.body && <p className="text-[11px] text-muted-foreground">{n.body}</p>}
                  <p className="text-[10px] uppercase tabular-nums text-muted-foreground">{clock(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <button type="button" onClick={() => onRead(n.id)} className="min-h-11 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground">
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
