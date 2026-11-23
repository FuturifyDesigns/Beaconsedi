import { useDeviceLocation } from "@/hooks/useDeviceLocation";
import { patientMapLabel } from "@/lib/map-labels";
import { AppShell } from "@/components/AppShell";
import { ShiftPanel } from "@/components/command/ShiftPanel";
import { ProfilePanel } from "@/components/command/ProfilePanel";
import { TeamPanel } from "@/components/command/TeamPanel";
import { VehiclePanel, type VehicleRecord } from "@/components/command/VehiclePanel";
import { useStaffShiftControls, useStaffProfileEditor } from "@/hooks/useStaffWorkflows";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Siren, Radio, Loader2, ShieldAlert, MapPin, Gauge, Ambulance, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleMap, type MapMarker, type MapRoute } from "@/components/GoogleMap";
import { NavigateButton } from "@/components/NavigateButton";
import { VoiceNotes } from "@/components/VoiceNotes";
import { useRoles } from "@/hooks/useRole";
import { useIncidents, useUnits } from "@/hooks/useOpsData";
import { useActiveShift, useShiftHistory, useShiftEvents, useTeam, useAssignedVehicle, useCurrentUser, useResponderProfile, useResponderRealtime } from "@/hooks/useResponder";
import { useResponderBroadcast } from "@/hooks/useTracking";
import { useLiveRoute, useEtaCountdown } from "@/hooks/useMaps";
import { GPS_STATE_META, gpsState } from "@/lib/tracking";
import { ACTION_META, applyIncidentAction, availableActions, type LifecycleAction } from "@/lib/incident-lifecycle";
import { PRIORITY_HEX, PRIORITY_META, distanceKm, sincePretty, type Incident } from "@/lib/ops";
import { buzz } from "@/lib/haptics";

export const Route = createFileRoute("/_authenticated/crew")({
  head: () => ({
    meta: [
      { title: "Ambulance crew app — BEACON SEDI" },
      { name: "description", content: "Accept SOS calls, follow the live route to the scene and stream ambulance GPS to dispatch." },
      { property: "og:title", content: "Ambulance crew app — BEACON SEDI" },
      { property: "og:description", content: "One-tap SOS acceptance, live routing and GPS broadcasting for ambulance crews." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrewApp,
});

function CrewApp() {
  const { isResponder: responderRole, isAdmin, loading } = useRoles();
  const isResponder = responderRole || isAdmin;
  const user = useCurrentUser();
  const queryClient = useQueryClient();

  const [section, setSection] = useState<"response" | "shift" | "profile" | "team" | "vehicle">("response");
  const shiftQuery = useActiveShift(user?.id);
  const { data: shift } = shiftQuery;
  const { data: shiftHistory = [] } = useShiftHistory(user?.id);
  const { data: shiftEvents = [] } = useShiftEvents(shift?.id ?? shiftHistory[0]?.id);
  const { data: team = [] } = useTeam(isResponder);
  const shiftControls = useStaffShiftControls();
  const profileEditor = useStaffProfileEditor(user);
  const onDuty = !!shift;

  const [busy, setBusy] = useState(false);

  const profileQuery = useResponderProfile(user?.id);
  const { data: profile } = profileQuery;
  const { data: incidents = [] } = useIncidents(isResponder);
  const { data: units = [] } = useUnits(isResponder);
  const vehicleQuery = useAssignedVehicle(user?.id);
  const { data: vehicle } = vehicleQuery;
  useResponderRealtime(isResponder, user?.id);

  const unitId = vehicle?.id ?? null;

  const active = useMemo(() => incidents.filter((i) => !["resolved", "cancelled"].includes(i.status)), [incidents]);

  /** The call this crew is committed to. */
  const job = useMemo<Incident | null>(
    () =>
      active.find((i) => (unitId && i.assigned_unit_id === unitId) || (user && i.responder_id === user.id)) ?? null,
    [active, unitId, user],
  );

  const queue = useMemo(
    () => active.filter((i) => i.id !== job?.id && !i.assigned_unit_id),
    [active, job],
  );

  const broadcast = useResponderBroadcast({
    // Always live-tracked once dispatched to a job, even if the crew forgot to go on duty.
    active: isResponder && (onDuty || !!job),
    responderId: user?.id,
    unitId,
    incidentId: job?.id ?? null,
    scene: job ? { lat: job.latitude, lng: job.longitude } : null,
    status: vehicle?.status ?? profile?.availability ?? null,
  });

  const deviceLocation = useDeviceLocation(isResponder && section === "response");
  const [locationFocus, setLocationFocus] = useState(0);
  const localPoint = deviceLocation.point;
  const here = localPoint ? { lat: localPoint.latitude, lng: localPoint.longitude } : broadcast.point ? { lat: broadcast.point.lat, lng: broadcast.point.lng } : null;
  const scene = job ? { lat: job.latitude, lng: job.longitude } : null;
  const { route } = useLiveRoute(here, scene, 15_000, job?.id ?? null);
  const { label: etaLabel } = useEtaCountdown(route?.durationInTrafficSeconds ?? route?.durationSeconds ?? null);

  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];
    if (here && !(unitId && (onDuty || job))) list.push({ id: "my-location", ...here, title: "Your current location", color: "#2563eb", scale: 9, noCluster: true, accuracyMeters: localPoint?.accuracy });
    if (scene && job) {
      list.push({
        image: "patient", id: "scene", lat: scene.lat, lng: scene.lng, scale: 14, pulse: true,
        color: PRIORITY_HEX[job.priority] ?? PRIORITY_HEX['high'],
        title: `${job.incident_code ?? "SOS"} — ${job.patient_name ?? "Anonymous"}`,
        label: patientMapLabel(job, units),
      });
    }
    for (const i of queue) {
      list.push({ id: `q-${i.id}`, lat: i.latitude, lng: i.longitude, scale: 9, color: PRIORITY_HEX[i.priority] ?? PRIORITY_HEX['high'], title: i.incident_code ?? "SOS" });
    }
    return list;
  }, [scene, job, queue, here?.lat, here?.lng, localPoint?.accuracy, unitId, onDuty, units]);

  const routes: MapRoute[] = route?.polyline ? [{ id: "to-scene", encoded: route.polyline, color: "#38bdf8", weight: 6 }] : [];

  function refresh(id?: string) {
    queryClient.invalidateQueries({ queryKey: ["ops", "incidents"] });
    queryClient.invalidateQueries({ queryKey: ["ops", "units"] });
    if (id) queryClient.invalidateQueries({ queryKey: ["ops", "events", id] });
  }

  async function run(incident: Incident, action: LifecycleAction) {
    if (!user || busy) return;
    setBusy(true);
    try {
      await applyIncidentAction(incident, action, {
        userId: user.id,
        actorName: profile?.full_name ?? user.email ?? null,
        units,
        preferredUnitId: unitId,
      });
      toast.success(ACTION_META[action].done);
      refresh(incident.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  /** One tap: take the call and put this ambulance on the road. */
  async function accept(incident: Incident) {
    if (!user || busy) return;
    buzz([30, 40, 30]);
    setBusy(true);
    try {
      const { error } = await supabase.rpc("accept_crew_incident" as never, { _alert_id: incident.id } as never);
      if (error) throw error;
      toast.success("Call accepted — routing to the scene");
      refresh(incident.id);
      void queryClient.invalidateQueries({ queryKey: ["responder", "assigned-vehicle"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not accept the call");
    } finally {
      setBusy(false);
    }
  }

  function setDuty(next: boolean) {
    shiftControls.change(next ? "clock_in" : "clock_out");
  }

  async function setVehicleStatus(status: string) {
    if (!vehicle) return;
    const { error } = await supabase.from("responder_units").update({ status }).eq("id", vehicle.id);
    if (error) { toast.error(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["responder", "unit"] });
    await queryClient.invalidateQueries({ queryKey: ["ops", "units"] });
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Checking crew credentials…</div>;
  }

  if (!isResponder) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-warning" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Ambulance crew access only</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask your dispatch admin to add you as a responder.</p>
      </div>
    );
  }

  const gps = GPS_STATE_META[gpsState(broadcast.lastPublishedAt)];
  const km = here && scene ? distanceKm(here, scene) : null;

  return (
    <AppShell><div className="mx-auto min-h-screen w-full max-w-5xl bg-background pb-8">
      <header className="border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emergency text-emergency-foreground">
              <Ambulance className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-sm font-bold leading-tight">{vehicle ? vehicle.call_sign : "Crew app"}</h1>
              <p className="text-[11px] text-muted-foreground">{vehicleQuery.isPending ? "Loading assigned ambulance…" : vehicleQuery.error ? "Assignment unavailable" : vehicle?.name ?? "No ambulance assigned"}</p>
            </div>
          </div>
          <button
            onClick={() => setDuty(!onDuty)}
            disabled={shiftControls.busy || shiftQuery.isPending || shiftQuery.isError}
            aria-pressed={onDuty}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${onDuty ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {onDuty ? "Clock out" : "Clock in"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${gps.chip}`}>
            <Radio className="mr-1 inline h-3 w-3" aria-hidden="true" />{onDuty || job ? gps.label : "GPS not shared"}
          </span>
          {broadcast.point?.accuracy != null && <span className="text-muted-foreground">±{Math.round(broadcast.point.accuracy)} m</span>}
          {broadcast.point?.speed != null && <span className="text-muted-foreground">{Math.round(broadcast.point.speed * 3.6)} km/h</span>}
          {(broadcast.error || broadcast.publishError) && (
            <span role="alert" className="text-emergency">{broadcast.publishError ?? broadcast.error}</span>
          )}
        </div>
      </header>

      <nav aria-label="Crew sections" className="flex gap-1 overflow-x-auto border-b border-border p-2">
        {([['response','Response'],['shift','Shifts'],['profile','Team profile'],['team','Team members'],['vehicle','Assigned vehicle']] as const).map(([key,label]) => <button key={key} aria-current={section===key ? "page" : undefined} onClick={() => setSection(key)} className={`shrink-0 rounded-lg px-3 py-2 text-sm ${section===key ? "bg-emergency text-emergency-foreground" : "text-muted-foreground"}`}>{label}</button>)}
      </nav>
      <main className="space-y-4 px-4 py-4">
        {shiftQuery.error && <p role="alert" className="text-sm text-destructive">Could not load your shift. Please reload before changing duty status.</p>}
        {vehicleQuery.error && <p role="alert" className="text-sm text-destructive">Could not load your assigned ambulance. <button onClick={() => void vehicleQuery.refetch()} className="underline">Retry assignment</button></p>}
        {!profile?.full_name && <div className="rounded-xl border border-border bg-card p-3 text-sm">Create your team profile before clocking in. <button onClick={() => setSection("profile")} className="font-semibold text-emergency underline">Create team profile</button></div>}
        {section === "shift" && <ShiftPanel shift={shift ?? null} events={shiftEvents} history={shiftHistory} busy={shiftControls.busy || shiftQuery.isPending || shiftQuery.isError} onClockIn={() => shiftControls.change("clock_in")} onClockOut={() => shiftControls.change("clock_out")} onBreakStart={() => shiftControls.change("break_start")} onBreakEnd={() => shiftControls.change("break_end")} />}
        {section === "profile" && (profileQuery.isPending ? <p className="text-sm text-muted-foreground">Loading team profile…</p> : profileQuery.error ? <p role="alert" className="text-sm text-destructive">Could not load your team profile. Please reload before editing.</p> : <ProfilePanel profile={profile ?? null} saving={profileEditor.saving} onSave={profileEditor.save} />)}
        {section === "team" && <TeamPanel team={team} units={units} />}
        {section === "vehicle" && <VehiclePanel vehicle={(vehicle as VehicleRecord) ?? null} onStatus={setVehicleStatus} />}
        {section === "response" && <>

        <section aria-label="Route map" className="overflow-hidden rounded-2xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
            <p role="status" className="text-xs text-muted-foreground">{deviceLocation.error ?? (localPoint ? `Your location · ±${Math.round(localPoint.accuracy)} m` : "Finding your location…")}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { deviceLocation.retry(); setLocationFocus((value) => value + 1); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold"><LocateFixed className="h-4 w-4" />My location</button>
              {job ? <NavigateButton incidentId={job.id} currentLocation={localPoint} className="border-emergency/40 text-emergency" /> : <button disabled className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground">Navigate · no active call</button>}
            </div>
          </div>
          <div className="h-[360px] w-full sm:h-[420px]">
            <GoogleMap
              markers={markers}
              routes={routes}
              vehicles={here && unitId && (onDuty || job) ? [{ id: "me", lat: here.lat, lng: here.lng, heading: broadcast.point?.heading ?? null, label: vehicle?.call_sign ?? "Unit", color: "#22c55e" }] : []}
              center={here ?? scene ?? { lat: -24.6282, lng: 25.9231 }}
              focus={here ? { ...here, zoom: 15, nonce: locationFocus } : null}
              zoom={here || scene ? 15 : 12}
              dark
              fitToMarkers={!here && !!scene}
              className="h-full w-full"
              fallbackDetails={job ? { lat: job.latitude, lng: job.longitude, address: job.address, incidentId: job.id } : localPoint ? { lat: localPoint.latitude, lng: localPoint.longitude, accuracyMeters: localPoint.accuracy, updatedAt: localPoint.at ? new Date(localPoint.at).toISOString() : null } : undefined}
            />
          </div>
          {job && (
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border text-center">
              <div className="px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ETA</p>
                <p className="text-lg font-bold tabular-nums">{etaLabel ?? "—"}</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Distance</p>
                <p className="text-lg font-bold tabular-nums">
                  {route ? `${(route.distanceMeters / 1000).toFixed(1)} km` : km != null ? `${km.toFixed(1)} km` : "—"}
                </p>
              </div>
            </div>
          )}
        </section>

        {job ? (
          <section aria-label="Current call" className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">{job.incident_code ?? "SOS"} · {sincePretty(job.created_at)}</p>
                <h2 className="text-base font-bold">{job.patient_name ?? "Anonymous patient"}</h2>
                <p className="text-xs capitalize text-muted-foreground">{job.incident_type.replace(/_/g, " ")}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${(PRIORITY_META[job.priority] ?? PRIORITY_META['high']).chip}`}>
                {(PRIORITY_META[job.priority] ?? PRIORITY_META['high']).label}
              </span>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {job.address ?? `${job.latitude.toFixed(5)}, ${job.longitude.toFixed(5)}`}
            </p>
            {job.message && <p className="rounded-lg bg-muted/50 p-2 text-xs">{job.message}</p>}

            <NavigateButton incidentId={job.id} currentLocation={localPoint} className="w-full border-emergency/40 text-emergency" />

            <VoiceNotes
              alertId={job.id}
              senderRole="responder"
              senderLabel={profile?.full_name ?? vehicle?.call_sign ?? null}
              recipientRole="patient"
              title="Voice notes with patient"
            />

            {route?.steps?.length ? (
              <ol className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                {route.steps.slice(0, 3).map((s, idx) => (
                  <li key={idx} className="flex gap-2">
                    <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{s.instruction} · {(s.distanceMeters / 1000).toFixed(1)} km</span>
                  </li>
                ))}
              </ol>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-1">
              {availableActions(job)
                .filter((a) => a !== "acknowledge" && a !== "dispatch")
                .map((a) => (
                  <button
                    key={a}
                    disabled={busy}
                    onClick={() => void run(job, a)}
                    className="rounded-xl border border-border px-3 py-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    {ACTION_META[a].label}
                  </button>
                ))}
            </div>
          </section>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No active call. Accept an incoming SOS below.
          </p>
        )}

        <section aria-label="Incoming SOS calls" className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Siren className="h-4 w-4 text-emergency" aria-hidden="true" /> Incoming SOS ({queue.length})
          </h2>
          {(!shift || shift.status !== "on_duty" || !unitId) && <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
            {!profile?.full_name ? <button onClick={() => setSection("profile")} className="font-semibold text-emergency underline">Complete your team profile to clock in.</button> : !shift ? <button onClick={() => setSection("shift")} className="font-semibold text-emergency underline">Clock in to accept calls.</button> : shift.status !== "on_duty" ? <button onClick={() => setSection("shift")} className="font-semibold text-emergency underline">End your break to accept calls.</button> : <span>Ask an administrator to assign your ambulance in Roles. It will appear here automatically.</span>}
          </div>}
          {!queue.length && <p className="rounded-xl border border-border p-4 text-xs text-muted-foreground">Nothing waiting right now.</p>}
          {queue.map((i) => {
            const d = here ? distanceKm(here, { lat: i.latitude, lng: i.longitude }) : null;
            return (
              <article key={i.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{i.patient_name ?? "Anonymous patient"}</p>
                    <p className="text-[11px] capitalize text-muted-foreground">
                      {i.incident_type.replace(/_/g, " ")} · {sincePretty(i.created_at)}{d != null ? ` · ${d.toFixed(1)} km away` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${(PRIORITY_META[i.priority] ?? PRIORITY_META['high']).chip}`}>
                    {(PRIORITY_META[i.priority] ?? PRIORITY_META['high']).label}
                  </span>
                </div>
                <button
                  disabled={busy || !shift || shift.status !== "on_duty" || !unitId}
                  onClick={() => void accept(i)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emergency px-4 py-3 text-sm font-bold text-emergency-foreground disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Ambulance className="h-4 w-4" aria-hidden="true" />}
                  Accept call
                </button>
              </article>
            );
          })}
        </section>
        </>}
      </main>
    </div></AppShell>
  );
}
