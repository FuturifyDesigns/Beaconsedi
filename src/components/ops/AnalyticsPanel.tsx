import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { minutesSince, type Incident, type Unit } from "@/lib/ops";

type Props = { incidents: Incident[]; units: Unit[] };

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-black tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export function AnalyticsPanel({ incidents, units }: Props) {
  const today = new Date().toDateString();
  const closedToday = incidents.filter((i) => i.resolved_at && new Date(i.resolved_at).toDateString() === today);
  const active = incidents.filter((i) => i.status !== "resolved");
  const critical = active.filter((i) => i.priority === "critical");

  const responseTimes = closedToday.map((i) => (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / 60000);
  const avgResponse = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
  const avgArrival = active.length
    ? active.reduce((a, i) => a + (i.eta_minutes ?? minutesSince(i.created_at)), 0) / active.length
    : 0;

  const busyUnits = units.filter((u) => u.status !== "available" && u.status !== "offline").length;
  const onlineUnits = units.filter((u) => u.status !== "offline").length;
  const utilisation = onlineUnits ? Math.round((busyUnits / onlineUnits) * 100) : 0;
  const successRate = incidents.length
    ? Math.round((incidents.filter((i) => i.status === "resolved").length / incidents.length) * 100)
    : 0;

  const byHour = Array.from({ length: 12 }, (_, idx) => {
    const hour = new Date(Date.now() - (11 - idx) * 3600_000);
    const count = incidents.filter((i) => {
      const t = new Date(i.created_at);
      return t.getHours() === hour.getHours() && t.toDateString() === hour.toDateString();
    }).length;
    return { hour: `${hour.getHours()}:00`, count };
  });

  const byPriority = (["critical", "high", "medium", "low"] as const).map((p) => ({
    priority: p[0].toUpperCase() + p.slice(1),
    count: incidents.filter((i) => i.priority === p).length,
  }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Active" value={String(active.length)} tone={active.length ? "text-emergency" : undefined} />
        <Kpi label="Closed today" value={String(closedToday.length)} tone="text-success" />
        <Kpi label="Avg response" value={`${avgResponse ? avgResponse.toFixed(0) : "—"} min`} />
        <Kpi label="Avg arrival ETA" value={`${avgArrival ? avgArrival.toFixed(0) : "—"} min`} />
        <Kpi label="Critical" value={String(critical.length)} tone="text-emergency" />
        <Kpi label="Resource use" value={`${utilisation}%`} />
        <Kpi label="Success rate" value={`${successRate}%`} tone="text-success" />
        <Kpi label="Units online" value={`${onlineUnits}/${units.length}`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-48 rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Incidents · last 12 hours</p>
          <ResponsiveContainer width="100%" height="80%">
            <AreaChart data={byHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={20} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="var(--emergency)" fill="var(--emergency)" fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="h-48 rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Incidents by priority</p>
          <ResponsiveContainer width="100%" height="80%">
            <BarChart data={byPriority}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="priority" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={20} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="var(--emergency)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
