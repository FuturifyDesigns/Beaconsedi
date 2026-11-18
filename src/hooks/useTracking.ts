import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { watchSmoothed, type Coords, type GpsQuality } from "@/lib/geolocation";
import { distanceKm } from "@/lib/ops";
import {
  bearing, gpsState, publishPing, shouldPublish,
  type GpsState, type ResponderPing, type TrackPoint,
} from "@/lib/tracking";

/* ----------------------------- responder side ------------------------------ */

type BroadcastArgs = {
  active: boolean;
  responderId: string | null | undefined;
  unitId: string | null | undefined;
  incidentId: string | null;
  scene: { lat: number; lng: number } | null;
  status: string | null;
};

export type BroadcastState = {
  point: TrackPoint | null;
  quality: GpsQuality;
  error: string | null;
  lastPublishedAt: string | null;
  publishError: string | null;
  publishing: boolean;
};

/**
 * Streams the responder's device GPS to the backend with an adaptive,
 * bandwidth-aware cadence. Every failure is surfaced and logged — an
 * emergency crew must never believe they are visible when they are not.
 */
export function useResponderBroadcast({ active, responderId, unitId, incidentId, scene, status }: BroadcastArgs): BroadcastState {
  const [point, setPoint] = useState<TrackPoint | null>(null);
  const [quality, setQuality] = useState<GpsQuality>("unavailable");
  const [error, setError] = useState<string | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const lastSent = useRef<TrackPoint | null>(null);
  const inFlight = useRef(false);
  const ctx = useRef({ incidentId, scene, status, unitId, responderId });
  ctx.current = { incidentId, scene, status, unitId, responderId };

  useEffect(() => {
    if (!active || !responderId) return;
    lastSent.current = null;

    const stop = watchSmoothed(
      (c: Coords, q: GpsQuality) => {
        const prev = lastSent.current;
        const next: TrackPoint = {
          lat: c.latitude,
          lng: c.longitude,
          heading:
            c.heading != null && Number.isFinite(c.heading)
              ? c.heading
              : prev
                ? bearing({ lat: prev.lat, lng: prev.lng }, { lat: c.latitude, lng: c.longitude })
                : null,
          speed: c.speed ?? null,
          accuracy: c.accuracy ?? null,
          at: new Date().toISOString(),
        };
        setPoint(next);
        setQuality(q);
        setError(null);

        const { scene: sc, incidentId: inc, status: st, unitId: uid, responderId: rid } = ctx.current;
        if (!rid) return;
        const dist = sc ? distanceKm({ lat: next.lat, lng: next.lng }, sc) : null;
        const responding = !!inc;
        if (inFlight.current) return;
        if (!shouldPublish({ last: lastSent.current, next, distanceToSceneKm: dist, responding })) return;

        inFlight.current = true;
        setPublishing(true);
        publishPing({ unitId: uid ?? null, responderId: rid, incidentId: inc, point: next, status: st })
          .then(() => {
            lastSent.current = next;
            setLastPublishedAt(next.at);
            setPublishError(null);
          })
          .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : "Location upload failed";
            console.error("[beacon:tracking] ping failed", e);
            setPublishError(msg);
          })
          .finally(() => {
            inFlight.current = false;
            setPublishing(false);
          });
      },
      (e) => {
        setError(e.message);
        setQuality("unavailable");
      },
    );
    return stop;
  }, [active, responderId]);

  return { point, quality, error, lastPublishedAt, publishError, publishing };
}

/* ----------------------------- dispatcher side ----------------------------- */

/** Latest GPS pings for a unit, streamed in real time. */
export function useUnitTrack(unitId: string | null | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["ops", "track", unitId],
    enabled: enabled && !!unitId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responder_locations")
        .select("*")
        .eq("unit_id", unitId!)
        .order("recorded_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as unknown as ResponderPing[];
    },
  });

  useEffect(() => {
    if (!enabled || !unitId) return;
    const ch = supabase
      .channel(`unit-track-${unitId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "responder_locations", filter: `unit_id=eq.${unitId}` },
        () => queryClient.invalidateQueries({ queryKey: ["ops", "track", unitId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, unitId, queryClient]);

  const pings = useMemo(() => q.data ?? [], [q.data]);
  const latest = pings[0] ?? null;

  const point: TrackPoint | null = latest
    ? {
        lat: latest.latitude,
        lng: latest.longitude,
        heading: latest.heading,
        speed: latest.speed,
        accuracy: latest.accuracy,
        at: latest.recorded_at,
      }
    : null;

  const trail = useMemo(
    () => pings.slice(0, 25).reverse().map((p) => ({ lat: p.latitude, lng: p.longitude })),
    [pings],
  );

  return { point, trail, pings, loading: q.isLoading, error: q.error as Error | null };
}

/** Re-renders on a timer so "last update Xs ago" labels never go stale. */
export function useTicker(ms = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export function useGpsState(at: string | null | undefined): GpsState {
  useTicker(1000);
  return gpsState(at);
}

/* -------------------------------- demo mode -------------------------------- */

/**
 * DEMO MODE only: walks a simulated vehicle along the real route polyline so
 * the console can be rehearsed without a live crew. Never writes to the backend.
 */
export function useDemoVehicle(path: { lat: number; lng: number }[], enabled: boolean, kmh = 55) {
  const [point, setPoint] = useState<TrackPoint | null>(null);
  const idx = useRef(0);

  useEffect(() => {
    if (!enabled || path.length < 2) {
      setPoint(null);
      return;
    }
    idx.current = 0;
    const stepMs = 1000;
    const id = window.setInterval(() => {
      let remaining = (kmh / 3.6) * (stepMs / 1000); // metres this tick
      while (remaining > 0 && idx.current < path.length - 1) {
        const a = path[idx.current];
        const b = path[idx.current + 1];
        const segM = distanceKm(a, b) * 1000;
        if (segM <= remaining) {
          remaining -= segM;
          idx.current += 1;
        } else break;
      }
      const a = path[Math.min(idx.current, path.length - 1)];
      const b = path[Math.min(idx.current + 1, path.length - 1)];
      setPoint({
        lat: a.lat,
        lng: a.lng,
        heading: bearing(a, b),
        speed: kmh / 3.6,
        accuracy: 8,
        at: new Date().toISOString(),
      });
      if (idx.current >= path.length - 1) window.clearInterval(id);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [enabled, kmh, path]);

  return point;
}

/* -------------------------------- patient side ------------------------------ */

export type PatientResponseView = {
  incidentStatus: string;
  unitId: string | null;
  callSign: string | null;
  kind: string | null;
  unitStatus: string | null;
  point: TrackPoint | null;
  etaMinutes: number | null;
};

/**
 * Live responder progress for the person who raised the SOS. Reads through a
 * capability-scoped backend function (the incident id is the capability) so an
 * anonymous SOS sender can still watch their unit approach, without exposing
 * any other incident, responder identity or patient record.
 */
export function usePatientResponseView(alertId: string | null): PatientResponseView | null {
  const [view, setView] = useState<PatientResponseView | null>(null);

  useEffect(() => {
    if (!alertId) {
      setView(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("incident_response_view", { _alert_id: alertId });
      if (cancelled) return;
      if (error) {
        console.error("[beacon:tracking] patient view failed", error);
        return;
      }
      const row = (data ?? [])[0];
      if (!row) return;
      setView({
        incidentStatus: row.incident_status,
        unitId: row.unit_id,
        callSign: row.call_sign,
        kind: row.kind,
        unitStatus: row.unit_status,
        etaMinutes: row.eta_minutes,
        point:
          row.latitude != null && row.longitude != null
            ? {
                lat: row.latitude,
                lng: row.longitude,
                heading: row.heading,
                speed: row.speed,
                accuracy: row.accuracy,
                at: row.last_location_update ?? new Date().toISOString(),
              }
            : null,
      });
    };

    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [alertId]);

  return view;
}
