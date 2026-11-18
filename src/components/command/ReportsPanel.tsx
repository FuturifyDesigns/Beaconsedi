import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Incident } from "@/lib/ops";
import { minutesSince } from "@/lib/ops";

type Props = { incidents: Incident[]; userId: string | undefined };

export function ReportsPanel({ incidents, userId }: Props) {
  const stats = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = incidents.filter((i) => new Date(i.created_at) >= startOfDay);
    const closed = today.filter((i) => i.status === "resolved");
    const critical = today.filter((i) => i.priority === "critical");
    const mine = incidents.filter((i) => i.responder_id === userId);
    const responseTimes = closed
      .filter((i) => i.resolved_at)
      .map((i) => (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / 60000);
    const avg = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    const open = incidents.filter((i) => i.status !== "resolved");
    const oldest = open.length ? Math.max(...open.map((i) => minutesSince(i.created_at))) : 0;

    const byHour = Array.from({ length: 12 }, (_, idx) => {
      const hour = new Date();
      hour.setMinutes(0, 0, 0);
      hour.setHours(hour.getHours() - (11 - idx));
      const next = new Date(hour.getTime() + 3_600_000);
      return {
        hour: hour.toLocaleTimeString([], { hour: "2-digit" }),
        incidents: incidents.filter((i) => {
          const t = new Date(i.created_at);
          return t >= hour && t < next;
        }).length,
      };
    });

    return {
      today: today.length,
      closed: closed.length,
      critical: critical.length,
      mine: mine.length,
      avg,
      oldest,
      byHour,
      utilization: incidents.length ? Math.round((mine.length / incidents.length) * 100) : 0,
    };
  }, [incidents, userId]);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Incidents today" value={String(stats.today)} />
        <Card label="Completed calls" value={String(stats.closed)} />
        <Card label="Critical emergencies" value={String(stats.critical)} tone="emergency" />
        <Card label="Avg. response time" value={`${stats.avg.toFixed(0)} min`} />
        <Card label="My assignments" value={String(stats.mine)} />
        <Card label="Oldest open call" value={`${stats.oldest.toFixed(0)} min`} tone="warning" />
        <Card label="My utilization" value={`${stats.utilization}%`} />
        <Card label="Open incidents" value={String(incidents.filter((i) => i.status !== "resolved").length)} />
      </dl>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Incident volume — last 12 hours</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.byHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
              />
              <Bar dataKey="incidents" fill="var(--color-emergency, #ef4444)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "emergency" | "warning" }) {
  const color = tone === "emergency" ? "text-emergency" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
