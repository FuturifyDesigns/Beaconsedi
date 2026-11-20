import { useStaffShiftControls, useStaffProfileEditor } from "@/hooks/useStaffWorkflows";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutDashboard, Siren, History, Truck, Clock, Users, Bell, User, Settings, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleMap, type MapMarker } from "@/components/GoogleMap";
import { useRoles } from "@/hooks/useRole";
import { useHospitals, useIncidentEvents, useIncidents, useUnits } from "@/hooks/useOpsData";
import {
  useActiveShift, useAssignedUnit, useCurrentUser, useInactivityLogout, useNotifications, useOwnPosition,
  usePatientProfile, useResponderProfile, useResponderRealtime, useShiftEvents, useShiftHistory, useTeam,
} from "@/hooks/useResponder";
import { CommandShell, type SectionKey } from "@/components/command/CommandShell";
import { SosFeed } from "@/components/command/SosFeed";
import { PatientPanel } from "@/components/command/PatientPanel";
import { ShiftPanel } from "@/components/command/ShiftPanel";
import { VehiclePanel, type VehicleRecord } from "@/components/command/VehiclePanel";
import { TeamPanel } from "@/components/command/TeamPanel";
import { NotificationsPanel } from "@/components/command/NotificationsPanel";
import { ReportsPanel } from "@/components/command/ReportsPanel";
import { ProfilePanel } from "@/components/command/ProfilePanel";
import { SettingsPanel, DEFAULT_PREFS, type CommandPrefs } from "@/components/command/SettingsPanel";
import { TimelinePanel } from "@/components/ops/TimelinePanel";
import { INCIDENT_STATUS, PRIORITY_HEX, logAudit, type Incident } from "@/lib/ops";
import { ACTION_META, applyIncidentAction, type LifecycleAction } from "@/lib/incident-lifecycle";
import { formatDuration, workedSeconds, type ResponderProfile } from "@/lib/responder";
import { useResponderBroadcast, useTicker } from "@/hooks/useTracking";
import { GPS_STATE_META, gpsState } from "@/lib/tracking";



export const Route = createFileRoute("/_authenticated/responder")({
  head: () => ({
    meta: [
      { title: "Responder command — BEACON SEDI" },
      { name: "description", content: "Live SOS reception, GPS tracking, shift and vehicle tools for BEACON SEDI first responders." },
      { property: "og:title", content: "Responder command — BEACON SEDI" },
      { property: "og:description", content: "Real-time emergency response console for BEACON SEDI first responders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({ section: ["dashboard","incidents","history","vehicle","shift","team","notifications","profile","settings"].includes(String(search.section)) ? String(search.section) as SectionKey : undefined }),
  component: ResponderCommandPage,
});

const PREFS_KEY = "beacon.command.prefs";

function ResponderCommandPage() {
  useTicker(10_000);
  const { isResponder: responderRole, isAdmin, loading } = useRoles();
  const isResponder = responderRole || isAdmin;
  const user = useCurrentUser();
  const shiftControls = useStaffShiftControls();
  const profileEditor = useStaffProfileEditor(user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [section, setSection] = useState<SectionKey>(Route.useSearch().section ?? "dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<CommandPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(PREFS_KEY) : null;
    if (raw) { try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) }); } catch { /* ignore */ } }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    const root = document.documentElement;
    root.classList.toggle("contrast-more", prefs.highContrast);
    root.style.setProperty("--command-motion", prefs.reducedMotion ? "0" : "1");
  }, [prefs]);

  const enabled = isResponder;
  const { data: incidents = [] } = useIncidents(enabled);
  const { data: units = [] } = useUnits(enabled);
  const { data: hospitals = [] } = useHospitals(enabled);
  const profileQuery = useResponderProfile(user?.id);
  const { data: profile } = profileQuery;
  const { data: team = [] } = useTeam(enabled);
  const shiftQuery = useActiveShift(user?.id);
  const { data: shift } = shiftQuery;
  const { data: shiftHistory = [] } = useShiftHistory(user?.id);
  const { data: shiftEvents = [] } = useShiftEvents(shift?.id ?? shiftHistory[0]?.id);
  const { data: vehicle } = useAssignedUnit(profile?.assigned_unit_id);
  const { data: notifications = [] } = useNotifications(user?.id);
  const ownPos = useOwnPosition(enabled);

  useResponderRealtime(enabled, user?.id);

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }, [navigate, queryClient]);

  useInactivityLogout(prefs.idleMinutes, () => {
    toast("Signed out after inactivity");
    void signOut();
  });

  const active = useMemo(() => incidents.filter((i) => !["resolved", "cancelled"].includes(i.status)), [incidents]);
  const historyIncidents = useMemo(() => incidents.filter((i) => ["resolved", "cancelled"].includes(i.status)), [incidents]);
  const selected = useMemo(
    () => incidents.find((i) => i.id === selectedId) ?? active[0] ?? null,
    [incidents, selectedId, active],
  );
  const { data: events = [], isLoading: eventsLoading } = useIncidentEvents(selected?.id ?? null, enabled);
  const canViewPatient = !!selected && !["active", "resolved", "cancelled"].includes(selected.status) && (isAdmin || selected.responder_id === user?.id);
  const { data: patient, isLoading: patientLoading } = usePatientProfile(canViewPatient ? selected?.patient_id : null);

  const unread = notifications.filter((n) => !n.read_at).length;

  // The incident this responder is currently committed to, if any.
  const myIncident = useMemo(
    () =>
      active.find(
        (i) =>
          (!!profile?.assigned_unit_id && i.assigned_unit_id === profile.assigned_unit_id) ||
          (!!user?.id && i.responder_id === user.id),
      ) ?? null,
    [active, profile?.assigned_unit_id, user?.id],
  );

  // Broadcast this responder's live GPS so dispatch and the patient can track them.
  const broadcast = useResponderBroadcast({
    // Always live-tracked once dispatched, even without an open shift.
    active: enabled && ((!!shift && shift.status !== "completed") || !!myIncident),
    responderId: user?.id,
    unitId: profile?.assigned_unit_id ?? null,
    incidentId: myIncident?.id ?? null,
    scene: myIncident ? { lat: myIncident.latitude, lng: myIncident.longitude } : null,
    status: vehicle?.status ?? profile?.availability ?? null,
  });


  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = active.map((i) => ({
      id: `inc-${i.id}`,
      image: "patient",
      lat: i.latitude,
      lng: i.longitude,
      title: `${i.incident_code ?? "SOS"} — ${i.patient_name ?? "Anonymous"}`,
      color: PRIORITY_HEX[i.priority] ?? PRIORITY_HEX.high,
      emphasis: i.id === selected?.id,
      scale: i.id === selected?.id ? 14 : 10,
      onClick: () => setSelectedId(i.id),
    }));
    for (const h of hospitals) {
      list.push({ id: `hosp-${h.id}`, lat: h.latitude, lng: h.longitude, title: h.name, color: "#e2e8f0", glyph: "+", scale: 9 });
    }
    if (ownPos) list.push({ id: "me", lat: ownPos.lat, lng: ownPos.lng, title: "My position", color: "#22c55e", glyph: "M", scale: 11 });
    return list;
  }, [active, units, hospitals, ownPos, selected]);

  /* ------------------------------ mutations ------------------------------ */

  async function updateAvailability(value: string) {
    if (!user) return;
    if (value === "offline" && shift) { shiftControls.change("clock_out"); return; }
    if (value === "on_break") { shiftControls.change("break_start"); return; }
    if (value === "available" && !shift) { shiftControls.change("clock_in"); return; }
    if (value === "available" && shift?.status === "on_break") { shiftControls.change("break_end"); return; }
    const { error } = await supabase
      .from("responder_profiles")
      .upsert({ user_id: user.id, availability: value } as never, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["responder", "profile", user.id] });

  }

  const clockIn = () => shiftControls.change("clock_in");
  const clockOut = () => shiftControls.change("clock_out");
  const breakStart = () => shiftControls.change("break_start");
  const breakEnd = () => shiftControls.change("break_end");

  async function setVehicleStatus(status: string) {
    if (!vehicle) return;
    const { error } = await supabase.from("responder_units").update({ status } as never).eq("id", vehicle.id);
    if (error) return toast.error(error.message);
    await logAudit("vehicle_status_change", "responder_unit", vehicle.id, { status });
    queryClient.invalidateQueries({ queryKey: ["responder", "unit", vehicle.id] });
    toast.success("Vehicle status updated");
  }

  async function incidentAction(incident: Incident, action: LifecycleAction) {
    if (!user || busy) return;
    setSelectedId(incident.id);
    setBusy(true);
    try {
      await applyIncidentAction(incident, action, {
        userId: user.id,
        actorName: profile?.full_name ?? user.email ?? null,
        units,
        preferredUnitId: profile?.assigned_unit_id ?? null,
      });
      if (action === "acknowledge" || action === "dispatch" || action === "arrive" || action === "transport") {
        await updateAvailability("responding");
      } else if (action === "resolve") {
        await updateAvailability("available");
      }
      queryClient.invalidateQueries({ queryKey: ["ops", "incidents"] });
      queryClient.invalidateQueries({ queryKey: ["ops", "units"] });
      queryClient.invalidateQueries({ queryKey: ["ops", "events", incident.id] });
      toast.success(ACTION_META[action].done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }


  async function markRead(ids: string[]) {
    if (!ids.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() } as never).in("id", ids);
    queryClient.invalidateQueries({ queryKey: ["responder", "notifications", user?.id] });
  }

  /* -------------------------------- render ------------------------------- */

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Verifying responder credentials…</div>;
  }

  if (!isResponder) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-warning" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Responder access only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This command dashboard holds live emergency and medical data. Ask your dispatch admin to grant you the responder role.
        </p>
      </div>
    );
  }

  const nav = [
    { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { key: "incidents" as const, label: "Active incidents", icon: Siren, badge: active.length },
    { key: "history" as const, label: "Incident history", icon: History },
    { key: "vehicle" as const, label: "Assigned vehicle", icon: Truck },
    { key: "shift" as const, label: "Shift details", icon: Clock },
    { key: "team" as const, label: "Team members", icon: Users },
    { key: "notifications" as const, label: "Notifications", icon: Bell, badge: unread },
    { key: "profile" as const, label: "Profile", icon: User },
    { key: "settings" as const, label: "Settings", icon: Settings },
  ];

  const mapBlock = (
    <section aria-label="Live response map" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="h-[320px] w-full lg:h-[420px]">
        <GoogleMap
          markers={markers}
          vehicles={units
            .filter(unit => unit.latitude != null && unit.longitude != null && unit.status !== "offline")
            .map(unit => ({
              id: unit.id,
              lat: unit.latitude!,
              lng: unit.longitude!,
              heading: unit.heading,
              label: unit.call_sign,
              stale: ["stale", "lost"].includes(gpsState(unit.last_location_update)),
            }))}
          center={ownPos ?? (selected ? { lat: selected.latitude, lng: selected.longitude } : undefined)}
          zoom={13}
          dark
          traffic
          fitToMarkers={!ownPos}
          className="h-full w-full"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${GPS_STATE_META[gpsState(broadcast.lastPublishedAt)].chip}`}>
          Live tracking · {GPS_STATE_META[gpsState(broadcast.lastPublishedAt)].label}
        </span>
        {broadcast.point?.accuracy != null && (
          <span className="text-muted-foreground">±{Math.round(broadcast.point.accuracy)} m</span>
        )}
        {broadcast.point?.speed != null && (
          <span className="text-muted-foreground">{Math.round(broadcast.point.speed * 3.6)} km/h</span>
        )}
        {myIncident && <span className="text-muted-foreground">Broadcasting to {myIncident.incident_code ?? "incident"}</span>}
        {(broadcast.error || broadcast.publishError) && (
          <span role="alert" className="text-emergency">{broadcast.publishError ?? broadcast.error}</span>
        )}
        {!shift && !myIncident && <span className="text-muted-foreground">Clock in to broadcast your position</span>}
      </div>
    </section>
  );


  return (
    <CommandShell
      nav={nav}
      section={section}
      onSection={setSection}
      profile={(profile as ResponderProfile) ?? null}
      email={user?.email ?? ""}
      vehicleLabel={vehicle ? `${vehicle.call_sign} · ${vehicle.name}` : "No vehicle assigned"}
      shiftLabel={shift ? `On duty ${formatDuration(workedSeconds(shift))}` : "Off duty"}
      unreadCount={unread}
      onSignOut={signOut}
      onAvailability={updateAvailability}
    >
      {shiftQuery.error && <p role="alert" className="mb-3 text-sm text-destructive">Could not load your shift. Please reload before changing duty status.</p>}
      {!profile?.full_name && <div className="mb-4 rounded-xl border border-border bg-card p-3 text-sm">Create your team profile before clocking in. <button onClick={() => setSection("profile")} className="font-semibold text-emergency underline">Create team profile</button></div>}
      {section === "dashboard" && (
        <div className="space-y-4">
          {mapBlock}
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Incoming SOS feed</h2>
              <SosFeed incidents={active} selectedId={selected?.id ?? null} onSelect={setSelectedId} onAction={incidentAction} origin={ownPos} busy={busy} />
            </div>
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient information</h2>
                <PatientPanel incident={selected} patient={patient ?? null} loading={patientLoading} canView={canViewPatient} />
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Incident timeline</h2>
                <TimelinePanel events={events} loading={eventsLoading} incidentCode={selected?.incident_code ?? null} />
              </section>
            </div>
          </div>
          <ReportsPanel incidents={incidents} userId={user?.id} />
        </div>
      )}

      {section === "incidents" && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <SosFeed incidents={active} selectedId={selected?.id ?? null} onSelect={setSelectedId} onAction={incidentAction} origin={ownPos} busy={busy} />
          <div className="space-y-4">
            {mapBlock}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient information</h2>
              <PatientPanel incident={selected} patient={patient ?? null} loading={patientLoading} canView={canViewPatient} />
            </section>
          </div>
        </div>
      )}

      {section === "history" && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Incident history</h2>
          {!historyIncidents.length ? (
            <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No closed incidents yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-xs">
                <caption className="sr-only">Closed incidents</caption>
                <thead>
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th scope="col" className="p-3">Code</th>
                    <th scope="col" className="p-3">Patient</th>
                    <th scope="col" className="p-3">Type</th>
                    <th scope="col" className="p-3">Received</th>
                    <th scope="col" className="p-3">Closed</th>
                    <th scope="col" className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyIncidents.map((i) => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="p-3 tabular-nums">{i.incident_code ?? "—"}</td>
                      <td className="p-3">{i.patient_name ?? "Anonymous"}</td>
                      <td className="p-3">{i.incident_type.replace(/_/g, " ")}</td>
                      <td className="p-3 tabular-nums">{new Date(i.created_at).toLocaleString()}</td>
                      <td className="p-3 tabular-nums">{i.resolved_at ? new Date(i.resolved_at).toLocaleString() : "—"}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${(INCIDENT_STATUS[i.status] ?? INCIDENT_STATUS.resolved).chip}`}>
                          {(INCIDENT_STATUS[i.status] ?? INCIDENT_STATUS.resolved).label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "vehicle" && <VehiclePanel vehicle={(vehicle as VehicleRecord) ?? null} onStatus={setVehicleStatus} />}

      {section === "shift" && (
        <ShiftPanel
          shift={shift ?? null}
          events={shiftEvents}
          history={shiftHistory}
          busy={busy || shiftControls.busy || shiftQuery.isPending || shiftQuery.isError}
          onClockIn={clockIn}
          onClockOut={clockOut}
          onBreakStart={breakStart}
          onBreakEnd={breakEnd}
        />
      )}

      {section === "team" && <TeamPanel team={team} units={units} />}

      {section === "notifications" && (
        <NotificationsPanel
          notifications={notifications}
          onRead={(id) => markRead([id])}
          onReadAll={() => markRead(notifications.filter((n) => !n.read_at).map((n) => n.id))}
        />
      )}

      {section === "profile" && (profileQuery.isPending ? <p className="text-sm text-muted-foreground">Loading team profile…</p> : profileQuery.error ? <p role="alert" className="text-sm text-destructive">Could not load your team profile. Please reload before editing.</p> : <ProfilePanel profile={(profile as ResponderProfile) ?? null} saving={profileEditor.saving} onSave={profileEditor.save} />)}

      {section === "settings" && <SettingsPanel prefs={prefs} onPrefs={setPrefs} />}
    </CommandShell>
  );
}
