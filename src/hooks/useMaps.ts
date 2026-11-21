import { useEffect, useMemo, useRef, useState } from "react";
import { computeRoute, nearbyEmergencyPlaces, reverseGeocode, travelMatrix, type PlaceResult, type RouteResult } from "@/lib/maps.functions";
import { watchSmoothed, gpsQuality, type Coords, type GpsQuality } from "@/lib/geolocation";
import { distanceKm } from "@/lib/ops";
import { createLatestRequestLoop } from "@/lib/map-request-control";

type Point = { lat: number; lng: number } | null;

/** Live, smoothed device position with GPS-quality reporting and graceful fallback. */
export function useLiveLocation(enabled = true) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [quality, setQuality] = useState<GpsQuality>("unavailable");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const stop = watchSmoothed(
      (c, q) => {
        setCoords(c);
        setQuality(q);
        setError(null);
      },
      (e) => {
        setError(e.message);
        setQuality("unavailable");
      },
    );
    return stop;
  }, [enabled]);

  return { coords, quality, error, degraded: quality === "poor" || quality === "unavailable" };
}

/** Traffic-aware route that recalculates on an interval and when endpoints move. */
export function useLiveRoute(origin: Point, destination: Point, intervalMs = 20_000, identity: string | null = "route") {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ origin, destination });
  latest.current = { origin, destination };
  const enabled = !!origin && !!destination;

  useEffect(() => {
    setRoute(null); setLoading(false); setError(null);
    if (!enabled) return;
    const loop = createLatestRequestLoop({
      latest: () => latest.current.origin && latest.current.destination ? { origin: latest.current.origin, destination: latest.current.destination } : null,
      request: ({ origin, destination }) => computeRoute({ data: { origin, destination, emergency: true, alternatives: false } }),
      onValue: value => { setRoute(value); setError(null); },
      onError: e => { setRoute(null); setError(e instanceof Error ? e.message : "Routing failed"); },
      onLoading: setLoading, intervalMs,
      available: () => navigator.onLine && document.visibilityState !== "hidden",
      shouldRefresh: (last, next, elapsed) => elapsed >= 60_000 || distanceKm(last.origin, next.origin) >= .015 || distanceKm(last.destination, next.destination) >= .015,
    });
    const tick = () => { void loop.tick(); };
    tick();
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      loop.stop();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [enabled, identity, intervalMs]);

  return { route, loading, error };
}

/** Sample billable address/place lookups, independently of live GPS rendering. */
function useLookupPoint(point: Point, meters: number, intervalMs: number): Point {
  const latest = useRef(point); latest.current = point;
  const [sample, setSample] = useState<Point>(null);
  const enabled = !!point;
  useEffect(() => {
    if (!enabled) { setSample(null); return; }
    let previous: Point = null;
    const update = () => {
      const next = latest.current;
      if (!next || !navigator.onLine || document.visibilityState === "hidden") return;
      if (!previous || distanceKm(previous, next) * 1000 >= meters) { previous = next; setSample(next); }
    };
    update();
    const timer = window.setInterval(update, intervalMs);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("online", update); };
  }, [enabled, meters, intervalMs]);
  return sample;
}

/** Reverse-geocoded address + nearest road for a point. */
export function useReverseGeocode(point: Point) {
  point = useLookupPoint(point, 30, 10_000);
  const [data, setData] = useState<{ address: string | null; nearestRoad: string | null; alternatives: string[] } | null>(null);
  const key = point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : null;

  useEffect(() => {
    if (!point) { setData(null); return; }
    let cancelled = false;
    reverseGeocode({ data: point })
      .then((r) => !cancelled && setData(r))
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return data;
}

/** Nearby hospitals / police / fire stations / landmarks around a point. */
export function useNearbyFacilities(point: Point, kinds: ("hospital" | "police" | "fire_station" | "landmark")[] = ["hospital", "police", "fire_station", "landmark"]) {
  point = useLookupPoint(point, 500, 30_000);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const key = point ? `${point.lat.toFixed(3)},${point.lng.toFixed(3)}|${kinds.join(",")}` : null;

  useEffect(() => {
    if (!point) { setPlaces([]); return; }
    let cancelled = false;
    setLoading(true);
    nearbyEmergencyPlaces({ data: { lat: point.lat, lng: point.lng, radiusMeters: 8000, kinds } })
      .then((r) => !cancelled && setPlaces(r))
      .catch((e) => console.error(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { places, loading };
}

/** Real drive-time / distance from many origins to one destination (Distance Matrix). */
export function useTravelMatrix(origins: { id: string; lat: number; lng: number }[], destination: Point) {
  const [rows, setRows] = useState<Record<string, { distanceMeters: number; durationSeconds: number; ok: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const capped = useMemo(() => origins.slice(0, 20), [origins.map((o) => o.id).join(",")]);
  const key = destination && capped.length
    ? `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}|${capped.map((o) => `${o.id}:${o.lat.toFixed(3)},${o.lng.toFixed(3)}`).join(";")}`
    : null;

  useEffect(() => {
    if (!key || !destination || !capped.length) return;
    let cancelled = false;
    setLoading(true);
    travelMatrix({ data: { origins: capped.map((o) => ({ lat: o.lat, lng: o.lng })), destination } })
      .then((res) => {
        if (cancelled) return;
        const next: Record<string, { distanceMeters: number; durationSeconds: number; ok: boolean }> = {};
        for (const r of res) {
          const origin = capped[r.originIndex];
          if (origin) next[origin.id] = { distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds, ok: r.ok };
        }
        setRows(next);
      })
      .catch((e) => console.error(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { rows, loading };
}

/** Counts an ETA down in real time, resetting whenever a fresh route arrives. */
export function useEtaCountdown(durationSeconds: number | null) {
  const [remaining, setRemaining] = useState<number | null>(durationSeconds);

  useEffect(() => {
    setRemaining(durationSeconds);
    if (durationSeconds == null) return;
    const id = window.setInterval(() => {
      setRemaining((r) => (r == null ? null : Math.max(0, r - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [durationSeconds]);

  const label = remaining == null
    ? null
    : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(Math.floor(remaining % 60)).padStart(2, "0")}`;

  return { remaining, label };
}

/** Browser online/offline state so the UI can show reconnection status. */

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export { gpsQuality };
