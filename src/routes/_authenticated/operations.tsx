import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useRoles } from "@/hooks/useRole";
import { useConnectionState, useHospitals, useIncidentEvents, useIncidents, useOpsRealtime, useUnits } from "@/hooks/useOpsData";
import { IncidentDrawer } from "@/components/ops/IncidentDrawer";
import { DispatchDialog } from "@/components/ops/DispatchDialog";
import { IncidentFilters, type IncidentFilter } from "@/components/ops/IncidentFilters";
import { OpsHeader } from "@/components/ops/OpsHeader";
import { OpsMap } from "@/components/ops/OpsMap";
import { IncidentCard } from "@/components/ops/IncidentCard";
import { UnitsPanel } from "@/components/ops/UnitsPanel";
import { HospitalsPanel } from "@/components/ops/HospitalsPanel";
import { TimelinePanel } from "@/components/ops/TimelinePanel";
import { AnalyticsPanel } from "@/components/ops/AnalyticsPanel";
import { QuickActions, type QuickActionKey } from "@/components/ops/QuickActions";
import { IntegrationStatusBar } from "@/components/ops/IntegrationStatusBar";
import {
  estimateEta, distanceKm, logAudit, logEvent, nearestHospital, nearestUnit,
  PRIORITY_ORDER, sincePretty, type Incident, type Priority,
} from "@/lib/ops";
import { ACTION_META, applyIncidentAction, type LifecycleAction } from "@/lib/incident-lifecycle";


export const Route = createFileRoute("/_authenticated/operations")({
  head: () => ({
    meta: [
      { title: "Trauma Operations Console — BEACON SEDI" },
      { name: "description", content: "Real-time trauma emergency operations centre: live incident map, dispatch, responder units, hospital capacity and response analytics." },
      { property: "og:title", content: "Trauma Operations Console — BEACON SEDI" },
      { property: "og:description", content: "Monitor and dispatch emergency responses in real time from the BEACON SEDI operations centre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OperationsPage,
});

/** Gaborone, Botswana — default operations area. */
const DEFAULT_CENTER = { lat: -24.6282, lng: 25.9231 };

function OperationsPage() {
  const { isResponder, isAdmin, loading: rolesLoading } = useRoles();
  const staff = isAdmin;
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [traffic, setTraffic] = useState(true);
  const [showUnits, setShowUnits] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<"units" | "hospitals" | "timeline">("units");
  const [filter, setFilter] = useState<IncidentFilter>("active");
  const [query, setQuery] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dispatchFor, setDispatchFor] = useState<Incident | null>(null);
  const link = useConnectionState(staff);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const incidentsQ = useIncidents(staff);
  const unitsQ = useUnits(staff);
  const hospitalsQ = useHospitals(staff);
  useOpsRealtime(staff);

  const incidents = useMemo(() => incidentsQ.data ?? [], [incidentsQ.data]);
  const units = useMemo(() => unitsQ.data ?? [], [unitsQ.data]);
  const hospitals = useMemo(() => hospitalsQ.data ?? [], [hospitalsQ.data]);

  const visible = useMemo(() => incidents.filter((i) => showTest || !i.is_test), [incidents, showTest]);

  const active = useMemo(
    () =>
      visible
        .filter((i) => i.status !== "resolved")
        .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority as Priority) - PRIORITY_ORDER.indexOf(b.priority as Priority)),
    [visible],
  );

  const queue = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = visible.filter((i) => {
      if (filter === "all") return true;
      if (filter === "active") return i.status !== "resolved";
      if (filter === "critical") return i.priority === "critical" && i.status !== "resolved";
      if (filter === "unassigned") return !i.assigned_unit_id && i.status !== "resolved";
      return i.status === filter;
    });
    const searched = q
      ? base.filter((i) =>
          [i.incident_code, i.id, i.patient_name, i.address, i.message, i.status, i.incident_type,
            units.find((u) => u.id === i.assigned_unit_id)?.call_sign]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : base;
    return searched.sort(
      (a, b) => PRIORITY_ORDER.indexOf(a.priority as Priority) - PRIORITY_ORDER.indexOf(b.priority as Priority),
    );
  }, [visible, filter, query, units]);

  const counts: Partial<Record<IncidentFilter, number>> = {
    all: visible.length,
    active: active.length,
    critical: active.filter((i) => i.priority === "critical").length,
    unassigned: active.filter((i) => !i.assigned_unit_id).length,
    resolved: visible.filter((i) => i.status === "resolved").length,
  };

  const selected = incidents.find((i) => i.id === selectedId) ?? active[0] ?? null;
  const eventsQ = useIncidentEvents(selected?.id ?? null, staff);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ops"] });

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function dispatchUnit(incident: Incident, kind?: string) {
    const match = nearestUnit(incident, units, kind);
    if (!match) throw new Error(`No available ${kind ?? "unit"} nearby`);
    const { data: u } = await supabase.auth.getUser();
    const { error: e1 } = await supabase
      .from("responder_units")
      .update({ status: "en_route", current_alert_id: incident.id, eta_minutes: match.eta })
      .eq("id", match.unit.id);
    if (e1) throw e1;
    const { error: e2 } = await supabase
      .from("alerts")
      .update({ status: "dispatched", assigned_unit_id: match.unit.id, eta_minutes: match.eta, responder_id: u.user?.id ?? null })
      .eq("id", incident.id);
    if (e2) throw e2;
    await logEvent(incident.id, "unit_dispatched", `${match.unit.call_sign} · ${match.km.toFixed(1)} km · ETA ${match.eta} min`);
    await logAudit("dispatch_unit", "alert", incident.id, { unit: match.unit.call_sign, eta: match.eta });
  }




  /** Single entry point for lifecycle transitions from an incident card. */
  async function lifecycleAction(incident: Incident, action: LifecycleAction) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not signed in");
    await applyIncidentAction(incident, action, { userId: u.user.id, actorName: u.user.email ?? null, units });
  }


  async function quickAction(key: QuickActionKey) {
    if (!selected) {
      toast.error("Select an incident first");
      return;
    }
    const i = selected;
    switch (key) {
      case "dispatch_ambulance": return run("Ambulance dispatched", () => dispatchUnit(i, "ambulance"));
      case "dispatch_police": return run("Police dispatched", () => dispatchUnit(i, "police"));
      case "dispatch_fire": return run("Fire unit dispatched", () => dispatchUnit(i, "fire"));
      case "air_ambulance": return run("Air ambulance requested", () => dispatchUnit(i, "air"));
      case "notify_hospital":
        return run("Hospital notified", async () => {
          const h = nearestHospital(i, hospitals);
          if (!h) throw new Error("No hospital available");
          await logEvent(i.id, "hospital_notified", `${h.hospital.name} · ${h.km.toFixed(1)} km · ETA ${estimateEta(h.km)} min`);
          await logAudit("notify_hospital", "alert", i.id, { hospital: h.hospital.name });
        });
      case "broadcast":
        return run("Emergency broadcast sent", async () => {
          await logEvent(i.id, "broadcast_sent", "Broadcast to all on-duty units");
          await logAudit("broadcast_alert", "alert", i.id);
        });
      case "backup":
        return run("Backup requested", async () => {
          await logEvent(i.id, "backup_requested");
          await logAudit("request_backup", "alert", i.id);
        });
      case "mass_casualty":
        return run("Mass casualty mode activated", async () => {
          const { error } = await supabase.from("alerts").update({ priority: "critical", incident_type: "mass_casualty" }).eq("id", i.id);
          if (error) throw error;
          await logEvent(i.id, "mass_casualty", "Mass casualty protocol activated");
          await logAudit("mass_casualty_mode", "alert", i.id);
        });
    }
  }

  // Dispatcher keyboard shortcuts
  useEffect(() => {
    if (!staff) return;
    const map: Record<string, QuickActionKey> = { a: "dispatch_ambulance", p: "dispatch_police", f: "dispatch_fire", h: "notify_hospital", b: "broadcast", r: "backup", l: "air_ambulance", m: "mass_casualty" };
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const action = map[e.key.toLowerCase()];
      if (action) { e.preventDefault(); void quickAction(action); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = active.findIndex((i) => i.id === selected?.id);
        const next = active[Math.min(active.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))];
        if (next) setSelectedId(next.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const notifications = useMemo(
    () =>
      active.slice(0, 8).map((i) => ({
        id: i.id,
        title: `${i.priority.toUpperCase()} · ${i.incident_code ?? i.id.slice(0, 8)}`,
        detail: i.message || i.address || `${i.latitude.toFixed(3)}, ${i.longitude.toFixed(3)}`,
        at: `${sincePretty(i.created_at)} ago`,
      })),
    [active],
  );

  const center = selected ? { lat: selected.latitude, lng: selected.longitude } : DEFAULT_CENTER;

  if (rolesLoading) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Loading operations console…</div>
      </AppShell>
    );
  }

  if (!staff) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-warning" />
          <h1 className="mt-4 text-xl font-bold">Operations access only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
             This console and its management controls are restricted to administrators.
          </p>
        </div>
      </AppShell>
    );
  }

  const error = incidentsQ.error || unitsQ.error || hospitalsQ.error;

  return (
    <AppShell>
      <div className="dark min-h-screen bg-background text-foreground">
        <OpsHeader
          activeCount={active.length}
          criticalCount={active.filter((i) => i.priority === "critical").length}
          availableUnits={units.filter((u) => u.status === "available").length}
          totalUnits={units.length}
          email={email}
          center={center}
          notifications={notifications}
        />

        <IntegrationStatusBar
          signals={{
            live: link,
            responderGps: units.some(
              (u) => u.last_location_update && Date.now() - new Date(u.last_location_update).getTime() < 60_000,
            ),
            patientGps: active.some(
              (i) => i.location_updated_at && Date.now() - new Date(i.location_updated_at).getTime() < 120_000,
            ),
            navigation: active.some((i) => i.assigned_unit_id && i.status !== "resolved"),
            communications: true,
          }}
        />

        <p
          role="status"
          className={`mx-4 mt-3 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
            link === "connected" ? "bg-success/10 text-success"
            : link === "connecting" ? "bg-warning/10 text-warning"
            : "bg-emergency/10 text-emergency"
          }`}
        >
          {link === "connected" ? "Live link connected — incidents stream in real time"
            : link === "connecting" ? "Reconnecting to the live incident stream…"
            : "Offline — showing last known data. Updates resume automatically when the connection returns."}
        </p>

        {error && (
          <p role="alert" className="mx-4 mt-3 rounded-lg border border-emergency/40 bg-emergency/10 px-3 py-2 text-xs text-emergency">
            Failed to load live data: {error instanceof Error ? error.message : "unknown error"}
          </p>
        )}

        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-3">
            <div className="h-[46vh] min-h-[320px]">
              <OpsMap
                incidents={active}
                units={units}
                hospitals={hospitals}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                traffic={traffic}
                onToggleTraffic={() => setTraffic((v) => !v)}
                showUnits={showUnits}
                onToggleUnits={() => setShowUnits((v) => !v)}
                center={center}
              />
            </div>

            <section aria-label="Emergency actions" className="rounded-xl border border-border bg-card/40 p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Emergency actions {selected ? `· ${selected.incident_code ?? ""}` : "· select an incident"}
              </h2>
              <QuickActions onAction={quickAction} disabled={busy || !selected} />
            </section>

            <section aria-label="Response analytics">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Analytics</h2>
              <AnalyticsPanel incidents={incidents} units={units} />
            </section>
          </div>

          <div className="space-y-3">
            <section aria-label="Active trauma incidents" className="rounded-xl border border-border bg-card/40 p-3">
              <h2 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Incident queue
                <span className="rounded-full bg-emergency/15 px-2 py-0.5 text-emergency">{queue.length}</span>
              </h2>
              <div className="mb-2">
                <IncidentFilters
                  filter={filter}
                  onFilter={setFilter}
                  query={query}
                  onQuery={setQuery}
                  counts={counts}
                  showTest={showTest}
                  onToggleTest={() => setShowTest((v) => !v)}
                />
              </div>
              {incidentsQ.isLoading ? (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}
                </div>
              ) : queue.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No incidents match this view.
                </p>
              ) : (
                <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                  {queue.map((i) => (
                    <li key={i.id}>
                      <IncidentCard
                        incident={i}
                        unit={units.find((u) => u.id === i.assigned_unit_id) ?? null}
                        selected={i.id === selected?.id}
                        onSelect={() => { setSelectedId(i.id); setDrawerOpen(true); }}
                        onAction={(a) =>
                          a === "dispatch"
                            ? setDispatchFor(i)
                            : run(ACTION_META[a].done, () => lifecycleAction(i, a))
                        }

                        busy={busy}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Resources" className="rounded-xl border border-border bg-card/40 p-3">
              <div role="tablist" aria-label="Resource panels" className="mb-2 flex gap-1">
                {([
                  ["units", `Units (${units.length})`],
                  ["hospitals", `Hospitals (${hospitals.length})`],
                  ["timeline", "Timeline"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`min-h-9 rounded-lg px-2.5 text-xs font-medium transition ${
                      tab === key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="max-h-[52vh] overflow-y-auto pr-1">
                {tab === "units" && <UnitsPanel units={units} incidents={incidents} onFocusIncident={setSelectedId} />}
                {tab === "hospitals" && <HospitalsPanel hospitals={hospitals} />}
                {tab === "timeline" && (
                  <TimelinePanel
                    events={eventsQ.data ?? []}
                    loading={eventsQ.isLoading}
                    incidentCode={selected?.incident_code ?? selected?.id.slice(0, 8) ?? null}
                  />
                )}
              </div>
              {selected && tab !== "timeline" && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Nearest hospital:{" "}
                  {(() => {
                    const h = nearestHospital(selected, hospitals);
                    return h ? `${h.hospital.name} · ${h.km.toFixed(1)} km · ETA ${estimateEta(h.km)} min` : "—";
                  })()}
                </p>
              )}
            </section>
          </div>
        </div>
        <p className="px-4 pb-6 text-[10px] text-muted-foreground">
          Shortcuts: A ambulance · P police · F fire · H hospital · B broadcast · R backup · L air · M mass casualty · ↑/↓ select incident
        </p>

        {drawerOpen && selected && (
          <IncidentDrawer
            incident={selected}
            unit={units.find((u) => u.id === selected.assigned_unit_id) ?? null}
            hospitals={hospitals}
            onClose={() => setDrawerOpen(false)}
            onRefresh={refresh}
          />
        )}

        {dispatchFor && (
          <DispatchDialog
            incident={dispatchFor}
            units={units}
            busy={busy}
            onClose={() => setDispatchFor(null)}
            onConfirm={(unitId, note) => {
              const target = dispatchFor;
              setDispatchFor(null);
              void run("Unit dispatched", async () => {
                const { data: u } = await supabase.auth.getUser();
                if (!u.user) throw new Error("Not signed in");
                await applyIncidentAction(target, "dispatch", {
                  userId: u.user.id,
                  actorName: u.user.email ?? null,
                  units,
                  preferredUnitId: unitId,
                  note: note || null,
                });
              });
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

// keeps distanceKm referenced for unit-distance tooltips in future iterations
void distanceKm;
