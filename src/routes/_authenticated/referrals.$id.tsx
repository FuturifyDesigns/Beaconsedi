import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Navigation, Phone, TriangleAlert, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GoogleMap, type LiveVehicle, type MapMarker, type MapRoute } from "@/components/GoogleMap";
import { supabase } from "@/integrations/supabase/client";
import { advanceReferral, assignReferralUnit, getReferral, getReferralTrack, listReferralData, respondReferral } from "@/lib/referrals.functions";
import { computeRoute } from "@/lib/maps.functions";
import {
  JOURNEY_STAGES,
  NEXT_STATUSES,
  REFERRAL_PRIORITY,
  REFERRAL_STATUS,
  TRACKING_STATUSES,
  decodePolyline,
  etaPretty,
  kmPretty,
  liveEtaMinutes,
  remainingKm,
  statusRank,
  travelledKm,
  type Referral,
  type ReferralFacility,
  type ReferralHandover,
  type ReferralHistoryEntry,
  type ReferralStatus,
  type ReferralUnit,
} from "@/lib/referrals";
import { gpsState, GPS_STATE_META, offRouteMeters } from "@/lib/tracking";
import { clock, distanceKm } from "@/lib/ops";
import { useRoles } from "@/hooks/useRole";
import { buzz } from "@/lib/haptics";

export const Route = createFileRoute("/_authenticated/referrals/$id")({
  head: () => ({
    meta: [
      { title: "Referral tracking — BEACON SEDI" },
      { name: "description", content: "Live ambulance referral journey, tracking and handover." },
      { property: "og:title", content: "Referral tracking — BEACON SEDI" },
      { property: "og:description", content: "Live ambulance referral journey, tracking and handover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralDetailPage,
});

const STAGE_ACTION: Partial<Record<ReferralStatus, { to: ReferralStatus; label: string }>> = {
  assigned: { to: "preparing", label: "Mark prepared for departure" },
  preparing: { to: "departed", label: "Confirm departure" },
  departed: { to: "en_route", label: "Confirm en route" },
  en_route: { to: "approaching", label: "Approaching destination" },
  approaching: { to: "arrived", label: "Confirm arrival" },
};

function ReferralDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isAdmin, isResponder, isOperator, isHospital } = useRoles();
  const canCoordinate = isAdmin || isOperator || isHospital;
  const detailFn = useServerFn(getReferral);
  const trackFn = useServerFn(getReferralTrack);
  const respondFn = useServerFn(respondReferral);
  const assignFn = useServerFn(assignReferralUnit);
  const advanceFn = useServerFn(advanceReferral);
  const routeFn = useServerFn(computeRoute);
  const fleetFn = useServerFn(listReferralData);

  const detail = useQuery({
    queryKey: ["referral", id],
    queryFn: () => detailFn({ data: { id } }),
    refetchInterval: 8_000,
  });

  const referral = detail.data?.referral as Referral | undefined;
  const unit = (detail.data?.unit ?? null) as ReferralUnit | null;
  const facilities = (detail.data?.facilities ?? []) as ReferralFacility[];
  const history = (detail.data?.history ?? []) as ReferralHistoryEntry[];
  const handover = (detail.data?.handover ?? []) as ReferralHandover[];
  const from = facilities.find((f) => f.id === referral?.from_facility_id) ?? null;
  const to = facilities.find((f) => f.id === referral?.to_facility_id) ?? null;

  const track = useQuery({
    queryKey: ["referral-track", unit?.id],
    queryFn: () => trackFn({ data: { unitId: unit!.id } }),
    enabled: !!unit,
    refetchInterval: 15_000,
  });

  const fleet = useQuery({
    queryKey: ["referral-command"],
    queryFn: () => fleetFn(),
    enabled: referral?.status === "accepted" || referral?.status === "assigned",
  });

  useEffect(() => {
    const channel = supabase
      .channel(`referral-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "referrals", filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["referral", id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "referral_status_history", filter: `referral_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["referral", id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["referral", id] });

  const respond = useMutation({
    mutationFn: (v: { decision: "accept" | "decline" }) => respondFn({ data: { id, decision: v.decision } }),
    onSuccess: invalidate,
  });

  const advance = useMutation({
    mutationFn: (v: { to: ReferralStatus; note?: string; handoverReceivedBy?: string; handoverNotes?: string }) =>
      advanceFn({ data: { id, ...v } }),
    onSuccess: () => {
      buzz([80, 60, 80]);
      invalidate();
    },
  });

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ unitId: "", driverName: "", driverPhone: "", crew: "", provider: "" });
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverForm, setHandoverForm] = useState({ receivedBy: "", notes: "" });

  const assign = useMutation({
    mutationFn: async () => {
      // Real route + ETA between the two facilities at assignment time.
      let totalDistanceKm: number | null = null;
      let routePolyline: string | null = null;
      let etaMinutes: number | null = null;
      if (from && to) {
        const route = await routeFn({
          data: {
            origin: { lat: from.latitude, lng: from.longitude },
            destination: { lat: to.latitude, lng: to.longitude },
            emergency: true,
          },
        });
        if (route) {
          totalDistanceKm = route.distanceMeters / 1000;
          routePolyline = route.polyline;
          etaMinutes = Math.round(route.durationSeconds / 60);
        }
      }
      return assignFn({
        data: {
          id,
          unitId: assignForm.unitId,
          driverName: assignForm.driverName || undefined,
          driverPhone: assignForm.driverPhone || undefined,
          crew: assignForm.crew || undefined,
          provider: assignForm.provider || undefined,
          totalDistanceKm,
          routePolyline,
          etaMinutes,
        },
      });
    },
    onSuccess: () => {
      setAssignOpen(false);
      invalidate();
    },
  });

  /* ------------------------------ derived state ----------------------------- */
  const remaining = remainingKm(unit, to);
  const travelled = travelledKm(referral ?? { total_distance_km: null }, remaining);
  const liveEta = referral && TRACKING_STATUSES.includes(referral.status) ? liveEtaMinutes(remaining, unit?.speed) : (referral?.eta_minutes ?? null);
  const gps = unit ? gpsState(unit.last_location_update) : null;

  const routePath = useMemo(() => (referral?.route_polyline ? decodePolyline(referral.route_polyline) : []), [referral?.route_polyline]);

  // Route deviation: live position far from the planned route.
  const deviation = useMemo(() => {
    if (!unit || unit.latitude == null || unit.longitude == null || !routePath.length || !TRACKING_STATUSES.includes(referral?.status ?? "pending")) return null;
    const off = offRouteMeters({ lat: unit.latitude, lng: unit.longitude }, routePath);
    return off != null && off > 750 ? off : null;
  }, [unit, routePath, referral?.status]);

  // Prolonged stop: recent pings cluster within 60 m over 10+ minutes while en route.
  const prolongedStop = useMemo(() => {
    const pings = track.data ?? [];
    if (!TRACKING_STATUSES.includes(referral?.status ?? "pending") || pings.length < 4) return false;
    const recent = pings.slice(0, 12);
    const spanMs = new Date(recent[0].recorded_at).getTime() - new Date(recent[recent.length - 1].recorded_at).getTime();
    if (spanMs < 10 * 60_000) return false;
    const first = recent[0];
    const spread = Math.max(...recent.map((p) => distanceKm({ lat: first.latitude, lng: first.longitude }, { lat: p.latitude, lng: p.longitude }) * 1000));
    return spread < 60;
  }, [track.data, referral?.status]);

  if (detail.isLoading) {
    return (
      <AppShell>
        <p className="p-6 text-sm text-muted-foreground">Loading referral…</p>
      </AppShell>
    );
  }
  if (!referral) {
    return (
      <AppShell>
        <p className="p-6 text-sm text-destructive">{(detail.error as Error)?.message ?? "Referral not found"}</p>
      </AppShell>
    );
  }

  const priority = REFERRAL_PRIORITY[referral.priority] ?? REFERRAL_PRIORITY.routine;
  const statusMeta = REFERRAL_STATUS[referral.status] ?? REFERRAL_STATUS.pending;
  const currentRank = statusRank(referral.status);
  const nextAction = STAGE_ACTION[referral.status];
  const canCancel = (NEXT_STATUSES[referral.status] ?? []).includes("cancelled") && canCoordinate;
  const historyByStatus = new Map<string, ReferralHistoryEntry>();
  history.forEach((h) => {
    if (!historyByStatus.has(h.status)) historyByStatus.set(h.status, h);
  });

  const mapMarkers: MapMarker[] = [];
  if (from) mapMarkers.push({ id: "from", lat: from.latitude, lng: from.longitude, title: `Departure — ${from.name}`, glyph: "F", color: "#38bdf8" });
  if (to) mapMarkers.push({ id: "to", lat: to.latitude, lng: to.longitude, title: `Destination — ${to.name}`, glyph: "H", color: priority.hex, emphasis: true });
  const mapRoutes: MapRoute[] = referral.route_polyline ? [{ id: "route", encoded: referral.route_polyline, color: priority.hex, weight: 5 }] : [];
  const mapVehicles: LiveVehicle[] =
    unit && unit.latitude != null && unit.longitude != null
      ? [{
          id: unit.id,
          lat: unit.latitude,
          lng: unit.longitude,
          heading: unit.heading,
          label: unit.call_sign,
          color: priority.hex,
          stale: gps === "stale" || gps === "lost",
        }]
      : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <Link to="/referrals" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Command centre
        </Link>

        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-bold tracking-wide">{referral.reference}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{from?.name ?? "—"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{to?.name ?? "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priority.chip}`}>{priority.label}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.chip}`}>{statusMeta.label}</span>
          </div>
        </header>

        {/* warnings */}
        {gps === "lost" && TRACKING_STATUSES.includes(referral.status) && (
          <Warning text={`GPS signal lost — showing the last known position${unit?.last_location_update ? ` from ${clock(unit.last_location_update)}` : ""}. It is not live.`} />
        )}
        {deviation != null && (
          <Warning text={`Route deviation — the ambulance is about ${(deviation / 1000).toFixed(1)} km off the planned route.`} />
        )}
        {prolongedStop && <Warning text="Unexpected prolonged stop — the ambulance has barely moved for over 10 minutes while en route." />}

        <div className="grid gap-4 lg:grid-cols-5">
          {/* left column: tracking card + actions */}
          <div className="space-y-4 lg:col-span-3">
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ambulance & patient</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
                <Item label="Registration" value={unit?.registration_number ?? "—"} mono big />
                <Item label="Fleet / call sign" value={unit?.call_sign ?? "—"} mono />
                <Item label="Make & model" value={unit?.vehicle ?? "—"} />
                <Item label="Provider" value={referral.provider ?? "—"} />
                <Item label="Driver" value={referral.driver_name ?? "—"} />
                <Item
                  label="Driver contact"
                  value={
                    referral.driver_phone ? (
                      <a href={`tel:${referral.driver_phone}`} className="inline-flex items-center gap-1 text-sky-300">
                        <Phone className="h-3 w-3" /> {referral.driver_phone}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <Item label="Medical crew" value={referral.crew ?? "—"} />
                <Item label="Patient reference" value={referral.patient_ref} mono />
                <Item label="Ambulance type" value={referral.ambulance_type ?? "—"} />
                <Item label="Condition" value={referral.patient_condition ?? "—"} />
                <Item label="Referring doctor" value={referral.referring_doctor ?? "—"} />
                <Item label="Contact" value={[referral.contact_person, referral.contact_phone].filter(Boolean).join(" · ") || "—"} />
              </dl>
              {referral.clinical_notes && (
                <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{referral.clinical_notes}</p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Journey</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
                <Item label="Referred" value={clock(referral.created_at)} />
                <Item label="Departed" value={referral.departed_at ? clock(referral.departed_at) : "—"} />
                <Item label="ETA" value={etaPretty(liveEta)} highlight />
                <Item label="Total distance" value={kmPretty(referral.total_distance_km)} />
                <Item label="Travelled" value={kmPretty(travelled)} />
                <Item label="Remaining" value={kmPretty(remaining)} highlight />
              </dl>
              {unit && gps && (
                <p className="mt-3 flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${GPS_STATE_META[gps].chip}`}>{GPS_STATE_META[gps].label}</span>
                  {unit.last_location_update && <span className="text-muted-foreground">last fix {clock(unit.last_location_update)}</span>}
                </p>
              )}
              {to && TRACKING_STATUSES.includes(referral.status) && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=driving`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-sky-500/15 px-4 py-2.5 text-sm font-medium text-sky-300 ring-1 ring-sky-400/40 hover:bg-sky-500/25"
                >
                  <Navigation className="h-4 w-4" /> Navigate to {to.name}
                </a>
              )}
            </section>

            {/* actions */}
            <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Actions</h2>

              {referral.status === "pending" && canCoordinate && (
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => respond.mutate({ decision: "accept" })} disabled={respond.isPending} icon={<Check className="h-4 w-4" />}>
                    Accept referral
                  </ActionButton>
                  <ActionButton danger onClick={() => respond.mutate({ decision: "decline" })} disabled={respond.isPending} icon={<X className="h-4 w-4" />}>
                    Decline
                  </ActionButton>
                </div>
              )}

              {canCoordinate && (referral.status === "accepted" || referral.status === "assigned") && (
                <div>
                  {!assignOpen ? (
                    <ActionButton onClick={() => setAssignOpen(true)} icon={<Navigation className="h-4 w-4" />}>
                      {referral.status === "assigned" ? "Change assigned vehicle" : "Assign ambulance"}
                    </ActionButton>
                  ) : (
                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted-foreground">Vehicle</span>
                        <select
                          value={assignForm.unitId}
                          onChange={(e) => setAssignForm((f) => ({ ...f, unitId: e.target.value }))}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Choose vehicle…</option>
                          {((fleet.data?.units ?? []) as ReferralUnit[])
                            .filter((u) => u.kind === "ambulance" || u.kind === "air")
                            .map((u) => (
                              <option key={u.id} value={u.id} disabled={u.status !== "available" && u.id !== referral.unit_id}>
                                {u.call_sign} · {u.registration_number ?? u.name} · {u.status}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input maxLength={200} placeholder="Driver name" value={assignForm.driverName} onChange={(e) => setAssignForm((f) => ({ ...f, driverName: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                        <input type="tel" maxLength={25} placeholder="Driver phone" value={assignForm.driverPhone} onChange={(e) => setAssignForm((f) => ({ ...f, driverPhone: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                        <input maxLength={200} placeholder="Medical crew" value={assignForm.crew} onChange={(e) => setAssignForm((f) => ({ ...f, crew: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                        <input maxLength={200} placeholder="Provider (optional)" value={assignForm.provider} onChange={(e) => setAssignForm((f) => ({ ...f, provider: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </div>
                      {assign.error && <p className="text-sm text-destructive">{(assign.error as Error).message}</p>}
                      <div className="flex gap-2">
                        <ActionButton onClick={() => assign.mutate()} disabled={!assignForm.unitId || assign.isPending}>
                          {assign.isPending ? "Routing…" : "Confirm assignment"}
                        </ActionButton>
                        <ActionButton subtle onClick={() => setAssignOpen(false)}>Back</ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {nextAction && (canCoordinate || isResponder) && (
                <ActionButton onClick={() => advance.mutate({ to: nextAction.to })} disabled={advance.isPending} icon={<Check className="h-4 w-4" />}>
                  {nextAction.label}
                </ActionButton>
              )}

              {referral.status === "arrived" && (
                <div>
                  {!handoverOpen ? (
                    <ActionButton onClick={() => setHandoverOpen(true)} icon={<CheckCircle2 className="h-4 w-4" />}>
                      Record patient handover
                    </ActionButton>
                  ) : (
                    <div className="space-y-3 rounded-lg border border-border p-4">
                      <input maxLength={120} placeholder="Received by (name, role)" value={handoverForm.receivedBy} onChange={(e) => setHandoverForm((f) => ({ ...f, receivedBy: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      <textarea maxLength={400} placeholder="Handover notes" rows={2} value={handoverForm.notes} onChange={(e) => setHandoverForm((f) => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      <div className="flex gap-2">
                        <ActionButton
                          onClick={() => advance.mutate({ to: "handover", handoverReceivedBy: handoverForm.receivedBy, handoverNotes: handoverForm.notes || undefined })}
                          disabled={!handoverForm.receivedBy.trim() || advance.isPending}
                        >
                          Confirm handover
                        </ActionButton>
                        <ActionButton subtle onClick={() => setHandoverOpen(false)}>Back</ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {referral.status === "handover" && (
                <ActionButton onClick={() => advance.mutate({ to: "completed" })} disabled={advance.isPending} icon={<CheckCircle2 className="h-4 w-4" />}>
                  Complete referral
                </ActionButton>
              )}

              {canCancel && (
                <ActionButton danger onClick={() => advance.mutate({ to: "cancelled" })} disabled={advance.isPending} icon={<X className="h-4 w-4" />}>
                  Cancel referral
                </ActionButton>
              )}

              {advance.error && <p className="text-sm text-destructive">{(advance.error as Error).message}</p>}
              {respond.error && <p className="text-sm text-destructive">{(respond.error as Error).message}</p>}
              {referral.status === "completed" && <p className="text-sm text-success">This referral is complete. The vehicle is available again.</p>}
              {(referral.status === "cancelled" || referral.status === "declined") && (
                <p className="text-sm text-muted-foreground">This referral is closed{referral.decision_note ? `: ${referral.decision_note}` : "."}</p>
              )}
            </section>
          </div>

          {/* right column: map + timeline */}
          <div className="space-y-4 lg:col-span-2">
            <div className="overflow-hidden rounded-xl border border-border">
              <GoogleMap
                markers={mapMarkers}
                routes={mapRoutes}
                vehicles={mapVehicles}
                followVehicleId={TRACKING_STATUSES.includes(referral.status) ? (unit?.id ?? null) : null}
                center={from ? { lat: from.latitude, lng: from.longitude } : undefined}
                zoom={7}
                mapTypeId="hybrid"
                className="h-[320px] w-full"
                fallbackDetails={{ lat: unit?.latitude, lng: unit?.longitude, address: to?.name }}
              />
            </div>

            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Journey timeline</h2>
              <ol className="space-y-3">
                {JOURNEY_STAGES.map((stage, i) => {
                  const stageRank = statusRank(stage.status);
                  const done = currentRank >= 0 && (currentRank > stageRank || (currentRank === stageRank && i <= JOURNEY_STAGES.findIndex((s) => s.status === referral.status)));
                  const entry = historyByStatus.get(stage.status);
                  return (
                    <li key={stage.key} className="flex items-start gap-3">
                      {done ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <div className="min-w-0">
                        <p className={`text-sm ${done ? "font-medium" : "text-muted-foreground"}`}>{stage.label}</p>
                        {done && entry && <p className="text-xs text-muted-foreground">{clock(entry.created_at)}{entry.note ? ` — ${entry.note}` : ""}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {handover.length > 0 && (
                <div className="mt-4 rounded-lg bg-success/10 p-3 text-xs">
                  <p className="font-medium text-success">Handover recorded</p>
                  {handover.map((h) => (
                    <p key={h.id} className="mt-1 text-muted-foreground">
                      Received by {h.received_by} at {clock(h.created_at)}{h.notes ? ` — ${h.notes}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Item({ label, value, mono, big, highlight }: { label: string; value: React.ReactNode; mono?: boolean; big?: boolean; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono" : ""} ${big ? "text-lg font-bold" : "font-medium"} ${highlight ? "text-sky-300" : ""}`}>{value}</dd>
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
      <TriangleAlert className="h-4 w-4 shrink-0" /> {text}
    </p>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
  subtle,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  subtle?: boolean;
  icon?: React.ReactNode;
}) {
  const cls = danger
    ? "border border-emergency/40 text-emergency hover:bg-emergency/10"
    : subtle
      ? "border border-border text-muted-foreground hover:bg-muted"
      : "bg-emergency text-emergency-foreground hover:bg-emergency/90";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${cls}`}
    >
      {icon}
      {children}
    </button>
  );
}
