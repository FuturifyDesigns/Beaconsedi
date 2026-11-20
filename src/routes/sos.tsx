import { phoneValue, textValue, PHONE_PATTERN } from "@/lib/validation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Siren, MapPin, ArrowLeft, CheckCircle2, Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, watchSmoothed, gpsQuality, type Coords } from "@/lib/geolocation";
import { buzz } from "@/lib/haptics";
import { playPing } from "@/lib/sound-settings";
import { SoundSettingsCard } from "@/components/SoundSettingsCard";
import { useRef } from "react";
import { GoogleMap, type MapMarker } from "@/components/GoogleMap";
import { VoiceNotes } from "@/components/VoiceNotes";
import { GpsBadge } from "@/components/GpsBadge";
import { useNearbyFacilities, useOnlineStatus, useReverseGeocode, useLiveRoute, useEtaCountdown } from "@/hooks/useMaps";
import { usePatientResponseView, useGpsState } from "@/hooks/useTracking";
import { RESPONSE_STATUS_META, GPS_STATE_META, responseStatus } from "@/lib/tracking";
import { distanceKm } from "@/lib/ops";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sos")({
  head: () => ({
    meta: [
      { title: "Emergency SOS — BEACON SEDI EMERGENCY APP" },
      { name: "description", content: "Send a one-tap emergency alert with your live location." },
      { property: "og:title", content: "Emergency SOS — BEACON SEDI EMERGENCY APP" },
      { property: "og:description", content: "Send an emergency alert with your live location or call Botswana emergency services." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SOSPage,
});

type Stage = "idle" | "locating" | "sending" | "sent";

function SOSPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [alertId, setAlertId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [holdProgress, setHoldProgress] = useState(0);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [noAckTimeout, setNoAckTimeout] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [recoveryError, setRecoveryError] = useState(false);
  const receiptKey = "beacon-active-sos";

  async function recoverAlert() {
    setRecovering(true);
    setRecoveryError(false);
    try {
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(receiptKey); } catch { /* Storage is optional. */ }
      if (!saved) return;
      let receipt: { alertId: string; patientId: string | null; sentAt: number };
      try { receipt = JSON.parse(saved); } catch { sessionStorage.removeItem(receiptKey); return; }
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!receipt || typeof receipt !== "object" || !uuid.test(receipt.alertId) || !Number.isFinite(receipt.sentAt) || receipt.sentAt > Date.now() || (receipt.patientId !== null && !uuid.test(receipt.patientId))) {
        sessionStorage.removeItem(receiptKey); return;
      }
      if (receipt.patientId) {
        const { data, error } = await supabase.auth.getUser();
        if (error?.name === "AuthSessionMissingError") { sessionStorage.removeItem(receiptKey); return; }
        if (error) throw error;
        if (data.user?.id !== receipt.patientId) { sessionStorage.removeItem(receiptKey); return; }
      }
      setAlertId(receipt.alertId); setPatientId(receipt.patientId);
      setSentAt(receipt.sentAt); setStage("sent");
    } catch { setRecoveryError(true); }
    finally { setRecovering(false); }
  }

  useEffect(() => { void recoverAlert(); }, []);

  useEffect(() => {
    if (status === "resolved" || status === "cancelled") {
      try { sessionStorage.removeItem(receiptKey); } catch { /* Storage is optional. */ }
    }
  }, [status]);

  function newAlert() {
    setHoldProgress(0); setAlertId(null); setPatientId(null); setCoords(null);
    setSentAt(null); setMessage(""); setStatus("active"); setStage("idle");
  }

  useEffect(() => {
    if (stage !== "sent" || status === "resolved" || status === "cancelled") return;
    const stop = watchSmoothed(
      async (c) => {
        setCoords(c);
        if (alertId) {
          const { error } = await supabase.rpc("update_sos_location", {
            _alert_id: alertId, _latitude: c.latitude, _longitude: c.longitude,
            _accuracy: c.accuracy, _heading: c.heading ?? null, _speed: c.speed ?? null,
          });
          if (error) toast.error("Live location update failed. Check your connection.");
        }
      },
      (e) => console.error(e),
    );
    return stop;
  }, [stage, alertId, status]);

  useEffect(() => {
    if (!alertId) return;
    const ch = supabase
      .channel("alert-" + alertId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alerts", filter: `id=eq.${alertId}` }, (payload) => {
        const row = payload.new as { status?: string };
        if (row.status) setStatus(row.status);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [alertId]);

  async function sendAlert() {
    if (recovering || recoveryError) return;
    try {
      phoneValue(phone, "Callback phone");
      textValue(name, "Your name", 200);
      textValue(message, "Message", 2000);
      setStage("locating");
      const c = await getCurrentPosition();
      setCoords(c);
      setStage("sending");
      const { data: userData } = await supabase.auth.getUser();
      const patient_id = userData.user?.id ?? null;
      let patient_name = name.trim() || null;
      let patient_phone = phone.trim() || null;
      if (patient_id && !patient_name) {
        const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", patient_id).maybeSingle();
        patient_name = profile?.full_name || null;
        patient_phone = profile?.phone || null;
      }
      const { data, error } = await supabase.rpc("submit_sos_alert", {
        _patient_name: patient_name,
        _patient_phone: patient_phone,
        _latitude: c.latitude,
        _longitude: c.longitude,
        _accuracy: c.accuracy,
        _heading: c.heading ?? null,
        _speed: c.speed ?? null,
        _message: message.trim() || null,
      }).single();
      if (error) throw new Error(error.message);
      setAlertId(data.id);
      setPatientId(patient_id);
      setStatus(data.status);
      setStage("sent");
      const submittedAt = Date.now();
      setSentAt(submittedAt);
      try { sessionStorage.setItem(receiptKey, JSON.stringify({ alertId: data.id, patientId: patient_id, sentAt: submittedAt })); } catch { /* Alert delivery must not depend on browser storage. */ }
      buzz([120, 60, 120, 60, 320]);
      toast.success("Alert sent. Waiting for a responder to acknowledge it.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send alert";
      toast.error(msg);
      setHoldProgress(0);
      setStage("idle");
    }
  }

  // Safety net: if no one acknowledges within 1 min 35 s, recommend calling 997.
  const ACK_TIMEOUT_MS = 95_000;
  const acknowledged = status !== "active";
  useEffect(() => {
    if (!sentAt || acknowledged) { setNoAckTimeout(false); return; }
    const left = ACK_TIMEOUT_MS - (Date.now() - sentAt);
    if (left <= 0) { setNoAckTimeout(true); return; }
    const t = setTimeout(() => {
      setNoAckTimeout(true);
      buzz([300, 120, 300, 120, 300]);
    }, left);
    return () => clearTimeout(t);
  }, [sentAt, acknowledged]);

  // Hold-to-send interaction
  useEffect(() => {
    if (stage !== "idle" || recovering || recoveryError) return;
    if (holdProgress >= 100) sendAlert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdProgress, stage, recovering, recoveryError]);

  function startHold() {
    if (stage !== "idle" || recovering || recoveryError) return;
    buzz(60);
    const start = Date.now();
    const duration = 900;
    const tick = () => {
      const p = Math.min(100, ((Date.now() - start) / duration) * 100);
      setHoldProgress(p);
      if (p < 100 && stage === "idle") frameRef = requestAnimationFrame(tick);
    };
    let frameRef = requestAnimationFrame(tick);
    const cleanup = () => {
      cancelAnimationFrame(frameRef);
      setHoldProgress((prev) => (prev >= 100 ? prev : 0));
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }

  const online = useOnlineStatus();
  const point = coords ? { lat: coords.latitude, lng: coords.longitude } : null;
  const geo = useReverseGeocode(stage === "sent" ? point : null);
  const { places } = useNearbyFacilities(stage === "sent" ? point : null);
  const quality = gpsQuality(coords?.accuracy);

  /* ------------------------- live responder tracking ------------------------ */
  const response = usePatientResponseView(stage === "sent" ? alertId : null);
  useEffect(() => {
    if (response?.incidentStatus) setStatus(response.incidentStatus);
  }, [response?.incidentStatus]);
  const unitPoint = response?.point ?? null;
  const unitGps = useGpsState(unitPoint?.at);
  const distanceToScene = unitPoint && point ? distanceKm({ lat: unitPoint.lat, lng: unitPoint.lng }, point) : null;
  const responseStage = responseStatus({
    incidentStatus: response?.incidentStatus ?? status,
    unitStatus: response?.unitStatus ?? null,
    hasUnit: !!response?.unitId,
    distanceKmToScene: distanceToScene,
  });
  const tracking = !!unitPoint && unitGps !== "lost" && !["on_scene", "patient_contact", "completed", "cancelled"].includes(responseStage);
  const { route: responderRoute } = useLiveRoute(tracking ? { lat: unitPoint!.lat, lng: unitPoint!.lng } : null, tracking ? point : null, 15_000);
  const { remaining: etaSeconds } = useEtaCountdown(
    responderRoute ? (responderRoute.durationInTrafficSeconds ?? responderRoute.durationSeconds) : null,
  );
  const etaLabel =
    etaSeconds != null ? `${Math.max(1, Math.round(etaSeconds / 60))} min`
    : response?.etaMinutes != null ? `${response.etaMinutes} min`
    : "—";
  const remainingKm = responderRoute ? responderRoute.distanceMeters / 1000 : distanceToScene;

  // Chime + buzz on every responder update (acknowledged, en route, arriving, on scene…), unless muted.
  const lastStage = useRef<string | null>(null);
  const updateKey = `${status}|${responseStage}`;
  useEffect(() => {
    if (stage !== "sent") return;
    if (lastStage.current !== null && lastStage.current !== updateKey) {
      playPing();
      buzz([80, 60, 80]);
    }
    lastStage.current = updateKey;
  }, [stage, updateKey]);

  // Persist the reverse-geocoded address on the alert so responders see it.
  useEffect(() => {
    if (!alertId || !geo?.address || status === "resolved" || status === "cancelled") return;
    if (!coords) return;
    void supabase.rpc("update_sos_location", { _alert_id: alertId, _latitude: coords.latitude, _longitude: coords.longitude, _accuracy: coords.accuracy, _address: geo.address });
  }, [alertId, geo?.address, coords?.latitude, coords?.longitude, status]);

  const facilityColor: Record<string, string> = {
    hospital: "#e2e8f0",
    police: "#3b82f6",
    fire_station: "#f97316",
    landmark: "#a855f7",
  };
  const facilityGlyph: Record<string, string> = { hospital: "+", police: "P", fire_station: "F", landmark: "L" };
  const facilityLabel: Record<string, string> = {
    hospital: "Hospitals",
    police: "Police stations",
    fire_station: "Fire stations",
    landmark: "Landmarks",
  };

  const markers: MapMarker[] = coords
    ? [
        {
          id: "me",
          image: "patient",
          lat: coords.latitude,
          lng: coords.longitude,
          title: "You",
          emphasis: true,
          pulse: true,
          noCluster: true,
          accuracyMeters: coords.accuracy,
        },
        ...places.map((p) => ({
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          title: p.name,
          color: facilityColor[p.kind],
          glyph: facilityGlyph[p.kind],
          scale: 8,
        })),
      ]
    : [];

  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: "Alert received", color: "bg-warning text-warning-foreground" },
    acknowledged: { label: "Alert acknowledged", color: "bg-warning text-warning-foreground" },
    dispatched: { label: "Responder en route", color: "bg-emergency text-emergency-foreground" },
    on_scene: { label: "Responder on scene", color: "bg-warning text-warning-foreground" },
    transporting: { label: "Transporting", color: "bg-warning text-warning-foreground" },
    cancelled: { label: "Cancelled", color: "bg-muted text-muted-foreground" },
    resolved: { label: "Resolved", color: "bg-success text-success-foreground" },
  };
  const st = statusLabels[status] ?? statusLabels.active;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <p className="text-sm font-semibold">Emergency SOS</p>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="sticky top-0 z-30 -mx-4 mb-6 bg-background/95 px-4 pb-2 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button asChild size="lg" className="h-auto min-h-16 w-full whitespace-normal bg-emergency px-3 py-2 text-center text-base font-bold uppercase tracking-wide text-emergency-foreground shadow-[var(--shadow-emergency)] hover:bg-emergency/90 focus-visible:ring-4 focus-visible:ring-emergency/40 sm:px-8 sm:text-lg"
            onClick={() => buzz([40, 60, 40])}>

            <a href="tel:997" aria-label="One tap to call Botswana emergency services on 997">
              <PhoneCall className="h-6 w-6" aria-hidden="true" />
              <span>One tap to call 997 — Botswana emergency</span>
            </a>
          </Button>
          <p className="mt-1 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            Ambulance — Botswana's primary emergency line
          </p>
        </div>
        {stage !== "sent" ? (
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">Hold to send SOS</h1>
            <p className="mt-2 text-muted-foreground">
              Press and hold. Your live location is shared with responders.
            </p>

            <div className="my-10 grid place-items-center">
              <button
                type="button"
                disabled={stage !== "idle" || recovering || recoveryError}
                onPointerDown={startHold}
                className="relative grid h-52 w-52 place-items-center rounded-full bg-emergency text-emergency-foreground shadow-[var(--shadow-emergency)] transition disabled:opacity-70"
                style={{
                  background: stage === "idle"
                    ? `conic-gradient(oklch(0.4 0.2 25) ${holdProgress}%, oklch(0.58 0.24 25) ${holdProgress}%)`
                    : undefined,
                }}
              >
                <span className="absolute inset-3 grid place-items-center rounded-full bg-emergency">
                  {stage === "idle" && <Siren className="h-16 w-16" />}
                  {(stage === "locating" || stage === "sending") && <Loader2 className="h-16 w-16 animate-spin" />}
                </span>
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {recovering ? "Checking for your existing alert…" : recoveryError ? "Could not recover your existing alert. Retry before sending another." : stage === "idle" && "Hold the button for 1 second"}
              {stage === "locating" && "Getting precise location..."}
              {stage === "sending" && "Notifying responders..."}
            </p>
            {recoveryError && <Button className="mt-3" onClick={() => void recoverAlert()}>Retry alert recovery</Button>}

            <div className="mx-auto mt-5 max-w-md sm:mt-10 space-y-3 text-left">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Optional details (helps responders)
              </p>
              <textarea maxLength={2000}
                value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="What's happening? (injury, chest pain, etc.)"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                rows={2}
              />
              <div className="grid grid-cols-2 gap-3">
                <input maxLength={200}
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                />
                <input type="tel" maxLength={25} pattern={PHONE_PATTERN}
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="Callback phone"
                  className="min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-success" />
                <h1 className="text-2xl font-bold">Alert sent</h1>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.color}`}>{st.label}</span>
            </div>
            {noAckTimeout && !acknowledged && (
              <div role="alert" className="mt-4 rounded-2xl border-2 border-emergency bg-emergency/10 p-4">
                <p className="text-base font-bold text-emergency">No response yet — call 997 now</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your alert hasn't been acknowledged within 1 min 35 s. Responders may have connection problems.
                  Your SOS stays active — please also call Botswana emergency services.
                </p>
                <Button asChild size="lg" className="mt-3 min-h-14 w-full bg-emergency text-lg font-bold uppercase text-emergency-foreground hover:bg-emergency/90">
                  <a href="tel:997" onClick={() => buzz([40, 60, 40])} aria-label="Call 997 Botswana emergency services">
                    <PhoneCall className="h-5 w-5" aria-hidden="true" /> Call 997 now
                  </a>
                </Button>
              </div>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {RESPONSE_STATUS_META[responseStage].patient}. Stay where you are if safe.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <GpsBadge quality={quality} accuracy={coords?.accuracy} online={online} />
              {(quality === "poor" || quality === "unavailable") && (
                <p role="alert" className="rounded-full bg-warning/15 px-3 py-1.5 text-xs text-warning">
                  GPS signal is weak — move to an open area if you can.
                </p>
              )}
            </div>

            {response?.callSign && (
              <div className="mt-4 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">🚑 {response.callSign}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RESPONSE_STATUS_META[responseStage].chip}`}>
                    {RESPONSE_STATUS_META[responseStage].label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">ETA</p>
                    <p className="text-lg font-bold tabular-nums">{etaLabel}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="text-lg font-bold tabular-nums">{remainingKm != null ? `${remainingKm.toFixed(1)} km` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unit GPS</p>
                    <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${GPS_STATE_META[unitGps].chip}`}>
                      {GPS_STATE_META[unitGps].label}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {alertId && patientId && (
              <VoiceNotes
                alertId={alertId}
                senderRole="patient"
                recipientRole="responder"
                title="Talk to your responder"
                className="mt-4"
              />
            )}

            <div className="mt-4 h-[420px] overflow-hidden rounded-2xl border border-border">
              {coords && (
                <GoogleMap
                  className="h-full w-full"
                  markers={markers}
                  center={{ lat: coords.latitude, lng: coords.longitude }}
                  zoom={16}
                  mapTypeId="roadmap"
                  geofences={[{ id: "search", lat: coords.latitude, lng: coords.longitude, radiusMeters: 800 }]}
                  fitToMarkers={!!unitPoint}
                  vehicles={
                    unitPoint
                      ? [{
                          id: response?.unitId ?? "unit",
                          lat: unitPoint.lat,
                          lng: unitPoint.lng,
                          heading: unitPoint.heading,
                          label: `${response?.callSign ?? "Unit"} — ${RESPONSE_STATUS_META[responseStage].label}`,
                          stale: unitGps === "stale" || unitGps === "lost",
                        }]
                      : []
                  }
                  routes={
                    responderRoute?.polyline
                      ? [{ id: "response", encoded: responderRoute.polyline, color: "#22d3ee", weight: 6 }]
                      : []
                  }
                />
              )}
            </div>


            {geo && (
              <div className="mt-4 rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinpointed location</p>
                <p className="mt-1 text-sm font-medium">{geo.address ?? "Resolving address…"}</p>
                {geo.nearestRoad && <p className="text-xs text-muted-foreground">Nearest road: {geo.nearestRoad}</p>}
              </div>
            )}

            {places.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(["hospital", "police", "fire_station", "landmark"] as const).map((kind) => {
                  const list = places.filter((p) => p.kind === kind).slice(0, 3);
                  if (!list.length) return null;
                  return (
                    <div key={kind} className="rounded-xl border border-border bg-card p-4">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: facilityColor[kind] }} aria-hidden="true" />
                        {facilityLabel[kind]}
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {list.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2">
                            <span className="truncate">{p.name}</span>
                            {p.phone && (
                              <a href={`tel:${p.phone}`} className="shrink-0 text-xs font-semibold text-emergency hover:underline">
                                Call
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {coords && (
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Latitude</p>
                  <p className="font-semibold">{coords.latitude.toFixed(5)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Longitude</p>
                  <p className="font-semibold">{coords.longitude.toFixed(5)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Accuracy</p>
                  <p className="font-semibold">±{Math.round(coords.accuracy)} m</p>
                </div>
              </div>
            )}

            <div className="mt-4"><SoundSettingsCard /></div>

            <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {status === "resolved" || status === "cancelled" ? "Location sharing stopped" : "Location updates automatically"}
            </div>
            {(status === "resolved" || status === "cancelled") && <Button className="mt-4 w-full" onClick={newAlert}>Start new SOS</Button>}
          </div>
        )}
      </main>
    </div>
  );
}
