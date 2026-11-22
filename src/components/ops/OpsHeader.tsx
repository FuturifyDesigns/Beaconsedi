import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { currentWeather } from "@/lib/maps.functions";
import { Bell, CloudSun, Radio, Siren, TriangleAlert, UserRound } from "lucide-react";
import { StarOfLife } from "@/components/StarOfLife";

type Props = {
  activeCount: number;
  criticalCount: number;
  availableUnits: number;
  totalUnits: number;
  email: string;
  center: { lat: number; lng: number };
  notifications: { id: string; title: string; detail: string; at: string }[];
};

function useWeather(lat: number, lng: number) {
  const fetchWeather = useServerFn(currentWeather);
  return useQuery({
    queryKey: ["ops", "weather", lat.toFixed(2), lng.toFixed(2)],
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
    queryFn: () => fetchWeather({ data: { lat, lng } }),
  });
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Siren; label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
      <Icon className={`h-4 w-4 shrink-0 ${tone ?? "text-muted-foreground"}`} aria-hidden="true" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-sm font-bold tabular-nums ${tone ?? "text-foreground"}`}>{value}</p>
      </div>
    </div>
  );
}

export function OpsHeader({ activeCount, criticalCount, availableUnits, totalUnits, email, center, notifications }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [openNotifs, setOpenNotifs] = useState(false);
  const weather = useWeather(center.lat, center.lng);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card/60 px-4 py-3 backdrop-blur lg:flex lg:flex-wrap lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg">
          <StarOfLife className="h-9 w-9" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-black tracking-tight sm:text-lg">
            BEACON SEDI <span className="text-emergency">Trauma Operations</span>
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
            <span className="tabular-nums">{now.toLocaleTimeString()}</span>
          </p>
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-auto">
        <Stat
          icon={CloudSun}
          label="Weather"
          value={
            weather.data
              ? `${weather.data.temperatureC != null ? Math.round(weather.data.temperatureC) + "°C" : "—"} · ${weather.data.description ?? "—"}`
              : weather.isError
                ? "Unavailable"
                : "…"
          }
        />
        <Stat icon={Siren} label="Active" value={String(activeCount)} tone={activeCount ? "text-emergency" : undefined} />
        <Stat icon={TriangleAlert} label="Critical" value={String(criticalCount)} tone={criticalCount ? "text-emergency" : undefined} />
        <Stat icon={Radio} label="Units free" value={`${availableUnits}/${totalUnits}`} tone="text-success" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenNotifs((v) => !v)}
            aria-expanded={openNotifs}
            aria-label={`Notification centre, ${notifications.length} recent events`}
            className="relative grid h-11 w-11 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Bell className="h-4 w-4" />
            {notifications.length > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-emergency px-1 text-[10px] font-bold text-emergency-foreground">
                {notifications.length}
              </span>
            )}
          </button>
          {openNotifs && (
            <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
              <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notification centre
              </p>
              <ul className="max-h-80 overflow-y-auto">
                {notifications.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No recent activity.</li>}
                {notifications.map((n) => (
                  <li key={n.id} className="border-b border-border px-3 py-2 last:border-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.detail}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{n.at}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground sm:block">{email || "Dispatcher"}</span>
        </div>
      </div>
    </header>
  );
}
