import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ambulance, ArrowRight, Download, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GoogleMap, type LiveVehicle, type MapMarker, type MapRoute } from "@/components/GoogleMap";
import { supabase } from "@/integrations/supabase/client";
import { listReferralData } from "@/lib/referrals.functions";
import {
  ACTIVE_STATUSES,
  REFERRAL_PRIORITY,
  REFERRAL_STATUS,
  TRACKING_STATUSES,
  etaPretty,
  kmPretty,
  liveEtaMinutes,
  remainingKm,
  type Referral,
  type ReferralFacility,
  type ReferralUnit,
} from "@/lib/referrals";
import { gpsState, GPS_STATE_META } from "@/lib/tracking";
import { sincePretty } from "@/lib/ops";
import { playAlertTone } from "@/lib/responder";
import { buzz } from "@/lib/haptics";

export const Route = createFileRoute("/_authenticated/referrals/")({
  head: () => ({
    meta: [
      { title: "Ambulance Referral Command Centre — BEACON SEDI" },
      { name: "description", content: "Live inter-facility ambulance referral coordination and long-distance tracking." },
      { property: "og:title", content: "Ambulance Referral Command Centre — BEACON SEDI" },
      { property: "og:description", content: "Live inter-facility ambulance referral coordination and long-distance tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralCommandCentre,
});

const FILTERS: { key: string; label: string; match: (r: Referral) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "pending", label: "Pending", match: (r) => r.status === "pending" },
  { key: "active", label: "Active", match: (r) => ACTIVE_STATUSES.includes(r.status) },
  { key: "moving", label: "On the road", match: (r) => TRACKING_STATUSES.includes(r.status) },
  { key: "completed", label: "Completed", match: (r) => r.status === "completed" },
  { key: "cancelled", label: "Cancelled", match: (r) => r.status === "cancelled" || r.status === "declined" },
];

function ReferralCommandCentre() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listReferralData);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const data = useQuery({
    queryKey: ["referral-command"],
    queryFn: () => listFn(),
    refetchInterval: 10_000,
  });

  // Realtime: new referrals and status changes arrive instantly, with sound.
  useEffect(() => {
    const channel = supabase
      .channel("referral-command")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "referrals" }, (payload) => {
        const ref = (payload.new as { reference?: string }).reference ?? "";
        toast.warning(`New referral received — ${ref}`);
        playAlertTone();
        buzz([120, 60, 120]);
        qc.invalidateQueries({ queryKey: ["referral-command"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "referrals" }, () => {
        qc.invalidateQueries({ queryKey: ["referral-command"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "responder_units" }, () => {
        qc.invalidateQueries({ queryKey: ["referral-command"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const referrals = useMemo(() => (data.data?.referrals ?? []) as Referral[], [data.data]);
  const facilities = useMemo(() => (data.data?.facilities ?? []) as ReferralFacility[], [data.data]);
  const units = useMemo(() => (data.data?.units ?? []) as ReferralUnit[], [data.data]);
  const facilityById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const visible = referrals.filter((r) => {
    const f = FILTERS.find((x) => x.key === filter);
    if (f && !f.match(r)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const unit = r.unit_id ? unitById.get(r.unit_id) : null;
    return [
      r.reference,
      r.patient_ref,
      r.provider ?? "",
      unit?.call_sign ?? "",
      unit?.registration_number ?? "",
      facilityById.get(r.from_facility_id)?.name ?? "",
      facilityById.get(r.to_facility_id)?.name ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const stats = useMemo(() => {
    const active = referrals.filter((r) => ACTIVE_STATUSES.includes(r.status));
    const completed = referrals.filter((r) => r.status === "completed");
    const durations = completed
      .filter((r) => r.completed_at)
      .map((r) => (new Date(r.completed_at!).getTime() - new Date(r.created_at).getTime()) / 60000);
    const distances = completed.map((r) => r.total_distance_km).filter((d): d is number => d != null);
    return {
      total: referrals.length,
      pending: referrals.filter((r) => r.status === "pending").length,
      active: active.length,
      moving: referrals.filter((r) => TRACKING_STATUSES.includes(r.status)).length,
      completed: completed.length,
      cancelled: referrals.filter((r) => r.status === "cancelled" || r.status === "declined").length,
      avgDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      avgDistance: distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : null,
    };
  }, [referrals]);

  /* ---------------------------------- map ---------------------------------- */
  const activeWithUnit = referrals.filter(
    (r) => ACTIVE_STATUSES.includes(r.status) && r.unit_id && unitById.get(r.unit_id)?.latitude != null,
  );

  const mapMarkers: MapMarker[] = [];
  const mapRoutes: MapRoute[] = [];
  const mapVehicles: LiveVehicle[] = [];

  referrals
    .filter((r) => r.status === "pending" || ACTIVE_STATUSES.includes(r.status))
    .forEach((r) => {
      const from = facilityById.get(r.from_facility_id);
      const to = facilityById.get(r.to_facility_id);
      const color = REFERRAL_PRIORITY[r.priority]?.hex ?? "#38bdf8";
      if (from) {
        mapMarkers.push({
          id: `from-${r.id}`,
          lat: from.latitude,
          lng: from.longitude,
          title: `Departure — ${from.name}`,
          glyph: "F",
          color: "#38bdf8",
          onClick: () => navigate({ to: "/referrals/$id", params: { id: r.id } }),
        });
      }
      if (to) {
        mapMarkers.push({
          id: `to-${r.id}`,
          lat: to.latitude,
          lng: to.longitude,
          title: `Destination — ${to.name}`,
          glyph: "H",
          color,
          emphasis: r.priority === "critical",
          onClick: () => navigate({ to: "/referrals/$id", params: { id: r.id } }),
        });
      }
      if (r.route_polyline) {
        mapRoutes.push({ id: `route-${r.id}`, encoded: r.route_polyline, color, weight: 4 });
      }
    });

  activeWithUnit.forEach((r) => {
    const unit = unitById.get(r.unit_id!)!;
    mapVehicles.push({
      id: unit.id,
      lat: unit.latitude!,
      lng: unit.longitude!,
      heading: unit.heading,
      label: unit.call_sign,
      color: REFERRAL_PRIORITY[r.priority]?.hex ?? "#22d3ee",
      stale: gpsState(unit.last_location_update) === "stale" || gpsState(unit.last_location_update) === "lost",
      onClick: () => navigate({ to: "/referrals/$id", params: { id: r.id } }),
    });
  });

  /* --------------------------------- export --------------------------------- */
  function exportCsv() {
    const header = "Reference,Priority,Status,From,To,Patient ref,Provider,Vehicle,Registration,Created,Departed,Arrived,Completed,Total km\n";
    const rows = visible
      .map((r) => {
        const unit = r.unit_id ? unitById.get(r.unit_id) : null;
        return [
          r.reference,
          r.priority,
          r.status,
          facilityById.get(r.from_facility_id)?.name ?? "",
          facilityById.get(r.to_facility_id)?.name ?? "",
          r.patient_ref,
          r.provider ?? "",
          unit?.call_sign ?? "",
          unit?.registration_number ?? "",
          r.created_at,
          r.departed_at ?? "",
          r.arrived_at ?? "",
          r.completed_at ?? "",
          r.total_distance_km ?? "",
        ]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-emergency/10 text-emergency">
              <Ambulance className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold md:text-2xl">Ambulance Referral Command Centre</h1>
              <p className="text-sm text-muted-foreground">
                Inter-facility transfers with live long-distance ambulance tracking.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <Link
              to="/referrals/new"
              className="flex items-center gap-1.5 rounded-lg bg-emergency px-4 py-2 text-sm font-medium text-emergency-foreground hover:bg-emergency/90"
            >
              <Plus className="h-4 w-4" /> New referral
            </Link>
          </div>
        </header>

        {/* stats */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total" value={String(stats.total)} />
          <Stat label="Pending" value={String(stats.pending)} tone="text-warning" />
          <Stat label="Active" value={String(stats.active)} tone="text-sky-300" />
          <Stat label="On the road" value={String(stats.moving)} tone="text-indigo-300" />
          <Stat label="Completed" value={String(stats.completed)} tone="text-success" />
          <Stat
            label="Avg journey"
            value={stats.avgDuration != null ? etaPretty(stats.avgDuration) : "—"}
            sub={stats.avgDistance != null ? `avg ${kmPretty(stats.avgDistance)}` : undefined}
          />
        </div>

        {/* filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === f.key ? "bg-emergency text-emergency-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f.label}
            </button>
          ))}
          <label className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input maxLength={400}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, vehicle, facility…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm"
            />
          </label>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {/* referral register */}
          <div className="min-w-0 space-y-3">
            {data.isLoading && <p className="text-sm text-muted-foreground">Loading referrals…</p>}
            {data.error && <p className="text-sm text-destructive">{(data.error as Error).message}</p>}
            {!data.isLoading && visible.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                No referrals match. Start one with <span className="font-medium text-foreground">New referral</span>.
              </div>
            )}
            {visible.map((r) => (
              <ReferralCard key={r.id} referral={r} facilityById={facilityById} unitById={unitById} />
            ))}
          </div>

          {/* live map */}
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-border">
              <GoogleMap
                markers={mapMarkers}
                routes={mapRoutes}
                vehicles={mapVehicles}
                center={{ lat: -24.6282, lng: 25.9231 }}
                zoom={6}
                mapTypeId="roadmap"
                className="h-[420px] w-full lg:h-[560px]"
                fallbackDetails={{}}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Blue markers are departure facilities, coloured markers are destinations, arrows are ambulances moving
              on live GPS. Tracking continues across the whole country — there is no distance limit.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ReferralCard({
  referral: r,
  facilityById,
  unitById,
}: {
  referral: Referral;
  facilityById: Map<string, ReferralFacility>;
  unitById: Map<string, ReferralUnit>;
}) {
  const from = facilityById.get(r.from_facility_id);
  const to = facilityById.get(r.to_facility_id);
  const unit = r.unit_id ? unitById.get(r.unit_id) : null;
  const remaining = remainingKm(unit, to);
  const liveEta = TRACKING_STATUSES.includes(r.status) ? liveEtaMinutes(remaining, unit?.speed) : r.eta_minutes;
  const gps = unit ? gpsState(unit.last_location_update) : null;
  const priority = REFERRAL_PRIORITY[r.priority] ?? REFERRAL_PRIORITY.routine;
  const status = REFERRAL_STATUS[r.status] ?? REFERRAL_STATUS.pending;

  return (
    <Link
      to="/referrals/$id"
      params={{ id: r.id }}
      className="block min-w-0 overflow-hidden rounded-xl border border-border bg-card p-4 transition hover:border-emergency/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm font-semibold tracking-wide">{r.reference}</p>
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priority.chip}`}>{priority.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.chip}`}>{status.label}</span>
        </div>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{from?.name ?? "—"}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{to?.name ?? "—"}</span>
      </p>

      {unit && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono text-sm font-bold text-foreground">{unit.registration_number ?? unit.call_sign}</span>
          <span>{unit.call_sign}</span>
          {unit.vehicle && <span>{unit.vehicle}</span>}
          {r.provider && <span>· {r.provider}</span>}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Patient {r.patient_ref}</span>
        <span>opened {sincePretty(r.created_at)}</span>
        {TRACKING_STATUSES.includes(r.status) && (
          <>
            <span>
              remaining <span className="font-medium text-foreground">{kmPretty(remaining)}</span>
            </span>
            <span>
              ETA <span className="font-medium text-foreground">{etaPretty(liveEta)}</span>
            </span>
            {gps && gps !== "live" && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${GPS_STATE_META[gps].chip}`}>
                {GPS_STATE_META[gps].label}
              </span>
            )}
          </>
        )}
      </div>
    </Link>
  );
}
