import { useCallback, useEffect, useRef, useState } from "react";
import { MapFallback, type MapFallbackDetails } from "@/components/MapFallback";

const BROWSER_KEY = (import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ||
  import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY) as string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

let loadPromise: Promise<void> | null = null;
let loaderScript: HTMLScriptElement | null = null;
let loaderCallback: string | null = null;

function clearPendingLoader(removeScript: boolean) {
  if (loaderCallback && typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>)[loaderCallback];
    loaderCallback = null;
  }
  if (removeScript && loaderScript) {
    loaderScript.remove();
    loaderScript = null;
  }
}

/** Drop the cached loader so a failed load can be retried. */
export function resetGoogleMapsLoader() {
  const loaded = typeof window !== "undefined" && !!(window as unknown as { google?: { maps?: unknown } }).google?.maps;
  clearPendingLoader(!loaded);
  loadPromise = null;
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as unknown as { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;
  if (!BROWSER_KEY) return Promise.reject(new Error("Google Maps key not configured"));

  loadPromise = new Promise((resolve, reject) => {
    const loadAttempt = (attempt: number) => {
      const cbName = "__beaconGoogleMapsReady_" + Math.random().toString(36).slice(2);
      loaderCallback = cbName;
      const script = document.createElement("script");
      loaderScript = script;
      const channel = CHANNEL ? `&channel=${encodeURIComponent(CHANNEL)}` : "";
      script.id = "beacon-google-maps";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&libraries=geometry&callback=${cbName}${channel}`;
      script.async = true;
      script.defer = true;

      let settled = false;
      const timeout = window.setTimeout(() => fail("Google Maps took too long to respond"), 15_000);
      const cleanupAttempt = (removeScript: boolean) => {
        window.clearTimeout(timeout);
        delete (window as unknown as Record<string, unknown>)[cbName];
        if (loaderCallback === cbName) loaderCallback = null;
        if (removeScript && loaderScript === script) {
          script.remove();
          loaderScript = null;
        }
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanupAttempt(true);
        if (attempt < 2 && navigator.onLine) {
          window.setTimeout(() => loadAttempt(attempt + 1), 750 * 2 ** attempt);
          return;
        }
        loadPromise = null;
        reject(new Error(navigator.onLine ? message : "No internet connection. Coordinates remain available."));
      };

      (window as unknown as Record<string, unknown>)[cbName] = () => {
        if (settled) return;
        settled = true;
        cleanupAttempt(false);
        resolve();
      };
      script.onerror = () => fail("Google Maps could not be reached on this network");
      document.head.appendChild(script);
    };
    loadAttempt(0);
  });
  return loadPromise;
}


export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  emphasis?: boolean;
  /** CSS color for the marker dot. Defaults to the emergency red. */
  color?: string;
  /** Single character rendered inside the marker. */
  glyph?: string;
  image?: "patient" | "ambulance";
  scale?: number;
  /** Draw a translucent accuracy radius (metres) around the marker. */
  accuracyMeters?: number;
  /** Pulse the marker (live SOS). */
  pulse?: boolean;
  /** Exclude from clustering (always visible). */
  noCluster?: boolean;
  onClick?: () => void;
};

export type MapRoute = {
  id: string;
  /** Encoded polyline from the Routes API. */
  encoded?: string | null;
  path?: { lat: number; lng: number }[];
  color?: string;
  dashed?: boolean;
  weight?: number;
};

export type MapGeofence = {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  color?: string;
  label?: string;
};

export type MapTypeId = "roadmap" | "satellite" | "hybrid" | "terrain";

/** A live, smoothly-animated vehicle marker (responder unit). */
export type LiveVehicle = {
  id: string;
  lat: number;
  lng: number;
  /** Degrees clockwise from north; rotates the arrow. */
  heading?: number | null;
  label?: string;
  color?: string;
  /** Dim the marker when its GPS fix is no longer trustworthy. */
  stale?: boolean;
  onClick?: () => void;
};

type Props = {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  fitToMarkers?: boolean;
  /** Overlay live traffic conditions. */
  traffic?: boolean;
  /** Use the night-ops basemap. */
  dark?: boolean;
  routes?: MapRoute[];
  geofences?: MapGeofence[];
  mapTypeId?: MapTypeId;
  /** Group dense markers into clusters. */
  cluster?: boolean;
  /** Incident details rendered when the map provider is unreachable. */
  fallbackDetails?: MapFallbackDetails;
  /** Live vehicles animated between GPS updates. */
  vehicles?: LiveVehicle[];
  /** Keep the camera locked on this vehicle. */
  followVehicleId?: string | null;
  /** Recenter the camera whenever `nonce` changes. */
  focus?: { lat: number; lng: number; zoom?: number; nonce: number } | null;
  /** Fit everything currently drawn whenever this value changes. */
  fitNonce?: number;
};



/* ------------------------------ google typings ----------------------------- */

type LatLngLiteral = { lat: number; lng: number };
type GMapsGlobal = {
  maps: {
    Size: new (width: number, height: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    Map: new (el: Element, opts: Record<string, unknown>) => GMap;
    Marker: new (opts: Record<string, unknown>) => GMarker;
    Circle: new (opts: Record<string, unknown>) => GOverlay;
    Polyline: new (opts: Record<string, unknown>) => GOverlay;
    TrafficLayer: new () => { setMap: (m: GMap | null) => void };
    LatLngBounds: new () => { extend: (l: LatLngLiteral) => void };
    SymbolPath: { CIRCLE: unknown; FORWARD_CLOSED_ARROW: unknown };
    Animation: { DROP: unknown; BOUNCE: unknown };
    geometry?: { encoding?: { decodePath: (s: string) => { lat: () => number; lng: () => number }[] } };
  };
};
type GMap = {
  setCenter: (l: LatLngLiteral) => void;
  panTo: (l: LatLngLiteral) => void;
  setZoom: (n: number) => void;
  fitBounds: (b: unknown) => void;
  setOptions: (o: Record<string, unknown>) => void;
};
type GMarker = {
  setMap: (m: GMap | null) => void;
  addListener: (event: string, cb: () => void) => void;
  setPosition: (l: LatLngLiteral) => void;
  setIcon: (i: unknown) => void;
  setTitle: (t: string) => void;
  setOpacity: (opacity: number) => void;
};
type GOverlay = { setMap: (m: GMap | null) => void };


const NIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1b2230" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1b2230" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ea0b8" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3446" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9fb0c7" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a465e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1621" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#4a5875" }] },
];

const DAY_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export function GoogleMap({
  markers,
  center,
  zoom = 14,
  className,
  fitToMarkers = true,
  traffic = false,
  dark = false,
  routes = [],
  geofences = [],
  mapTypeId = "hybrid",
  cluster = false,
  fallbackDetails,
  vehicles = [],
  followVehicleId = null,
  focus = null,
  fitNonce,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRefs = useRef<GMarker[]>([]);
  const overlayRefs = useRef<GOverlay[]>([]);
  const clusterRef = useRef<{ clearMarkers: () => void; addMarkers: (markers: never) => void } | null>(null);
  const trafficRef = useRef<{ setMap: (m: GMap | null) => void } | null>(null);
  const boundsRef = useRef<unknown>(null);
  const vehicleRefs = useRef<Map<string, { marker: GMarker; lat: number; lng: number; heading: number; raf: number | null }>>(new Map());
  const didFit = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    resetGoogleMapsLoader();
    setError(null);
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!error) return;
    const retryWhenOnline = () => retry();
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [error, retry]);

  const routesKey = JSON.stringify(routes.map((r) => [r.id, r.encoded ?? r.path?.length ?? 0, r.color]));
  const fencesKey = JSON.stringify(geofences);
  const vehiclesKey = JSON.stringify(vehicles.map((v) => [v.id, v.lat.toFixed(6), v.lng.toFixed(6), v.heading ?? 0, v.stale, v.color, v.label]));



  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async () => {
        if (cancelled || !ref.current) return;
        const g = (window as unknown as { google: GMapsGlobal }).google;
        setError(null);
        setReady(true);

        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(ref.current, {
            center: center ?? { lat: markers[0]?.lat ?? 0, lng: markers[0]?.lng ?? 0 },
            zoom,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
            clickableIcons: false,
            maxZoom: 21,
            tilt: 0,
            mapTypeId,
            styles: mapTypeId === "roadmap" ? (dark ? NIGHT_STYLE : DAY_STYLE) : undefined,
          });
        } else {
          mapRef.current.setOptions({
            mapTypeId,
            styles: mapTypeId === "roadmap" ? (dark ? NIGHT_STYLE : DAY_STYLE) : null,
          });
        }
        const map = mapRef.current;

        if (traffic) {
          if (!trafficRef.current) trafficRef.current = new g.maps.TrafficLayer();
          trafficRef.current.setMap(map);
        } else if (trafficRef.current) {
          trafficRef.current.setMap(null);
        }

        // clear previous markers + overlays
        clusterRef.current?.clearMarkers();
        markerRefs.current.forEach((m) => m.setMap(null));
        markerRefs.current = [];
        overlayRefs.current.forEach((o) => o.setMap(null));
        overlayRefs.current = [];

        const bounds = new g.maps.LatLngBounds();
        const clusterable: GMarker[] = [];

        markers.forEach((m) => {
          const color = m.color ?? "#e11d3f";
          const marker = new g.maps.Marker({
            position: { lat: m.lat, lng: m.lng },
            map,
            title: m.title,
            optimized: true,
            animation: m.emphasis || m.pulse ? g.maps.Animation.BOUNCE : undefined,
            zIndex: m.emphasis ? 999 : 1,
            label: m.glyph ? { text: m.glyph, color: "#ffffff", fontSize: "10px", fontWeight: "700" } : undefined,
            icon: m.image ? {
              url: import.meta.env.BASE_URL + "map-icons/" + m.image + ".png",
              scaledSize: new g.maps.Size(m.image === "patient" ? 40 : 64, m.image === "patient" ? 60 : 43),
              anchor: new g.maps.Point(m.image === "patient" ? 20 : 32, m.image === "patient" ? 60 : 22),
            } : {
              path: g.maps.SymbolPath.CIRCLE,
              scale: m.scale ?? (m.emphasis ? 13 : 9),
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: m.emphasis ? 3 : 2,
            },
          });
          if (m.onClick) marker.addListener("click", m.onClick);
          markerRefs.current.push(marker);
          if (cluster && !m.noCluster && !m.emphasis) clusterable.push(marker);

          if (m.accuracyMeters && m.accuracyMeters > 0) {
            overlayRefs.current.push(
              new g.maps.Circle({
                map,
                center: { lat: m.lat, lng: m.lng },
                radius: m.accuracyMeters,
                strokeColor: color,
                strokeOpacity: 0.5,
                strokeWeight: 1,
                fillColor: color,
                fillOpacity: 0.12,
                clickable: false,
              }),
            );
          }
          bounds.extend({ lat: m.lat, lng: m.lng });
        });

        if (cluster && clusterable.length) {
          try {
            if (!clusterRef.current) {
              const { MarkerClusterer } = await import("@googlemaps/markerclusterer");
              clusterable.forEach((m) => m.setMap(null));
              clusterRef.current = new MarkerClusterer({ map: map as never, markers: clusterable as never });
            } else {
              clusterable.forEach((m) => m.setMap(null));
              clusterRef.current.addMarkers(clusterable as never);
            }
          } catch (clusterError) {
            console.warn("[beacon:maps] clustering unavailable; showing individual markers", clusterError);
          }
        }

        // geofences
        geofences.forEach((f) => {
          overlayRefs.current.push(
            new g.maps.Circle({
              map,
              center: { lat: f.lat, lng: f.lng },
              radius: f.radiusMeters,
              strokeColor: f.color ?? "#38bdf8",
              strokeOpacity: 0.8,
              strokeWeight: 1.5,
              fillColor: f.color ?? "#38bdf8",
              fillOpacity: 0.07,
              clickable: false,
            }),
          );
        });

        // routes
        routes.forEach((r) => {
          let path: LatLngLiteral[] = r.path ?? [];
          if (!path.length && r.encoded && g.maps.geometry?.encoding) {
            path = g.maps.geometry.encoding.decodePath(r.encoded).map((p) => ({ lat: p.lat(), lng: p.lng() }));
          }
          if (path.length < 2) return;
          overlayRefs.current.push(
            new g.maps.Polyline({
              map,
              path,
              strokeColor: r.color ?? "#38bdf8",
              strokeOpacity: r.dashed ? 0 : 0.9,
              strokeWeight: r.weight ?? 5,
              zIndex: 5,
              icons: r.dashed
                ? [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, scale: 3 }, offset: "0", repeat: "14px" }]
                : undefined,
            }),
          );
          path.forEach((p) => bounds.extend(p));
        });

        boundsRef.current = bounds;

        if (fitToMarkers && markers.length > 1 && !didFit.current) {
          map.fitBounds(bounds);
          didFit.current = true;
        } else if (markers.length === 1 && !didFit.current) {
          map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
          map.setZoom(zoom);
          didFit.current = true;
        }
      })
      .catch((err) => {
        console.error("[beacon:maps] load failed", err);
        setError(err instanceof Error ? err.message : "Map failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [markers, center?.lat, center?.lng, zoom, fitToMarkers, traffic, dark, mapTypeId, cluster, routesKey, fencesKey, retryKey]);

  // Recenter when the caller moves the focus point.
  useEffect(() => {
    if (!center || !mapRef.current || !ready || followVehicleId) return;
    mapRef.current.setCenter(center);
  }, [center?.lat, center?.lng, ready, followVehicleId]);

  /* --------------------------- live vehicle layer -------------------------- */
  // Vehicles live outside the marker rebuild so they can be tweened between
  // GPS fixes instead of teleporting on every update.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const g = (window as unknown as { google?: GMapsGlobal }).google;
    if (!g) return;

    const icon = (_v: LiveVehicle, _heading: number) => ({
      url: import.meta.env.BASE_URL + "map-icons/ambulance.png",
      scaledSize: new g.maps.Size(64, 43),
      anchor: new g.maps.Point(32, 22),
    });
    const seen = new Set<string>();
    vehicles.forEach((v) => {
      seen.add(v.id);
      const heading = v.heading ?? 0;
      const existing = vehicleRefs.current.get(v.id);

      if (!existing) {
        const marker = new g.maps.Marker({
          position: { lat: v.lat, lng: v.lng },
          map,
          title: v.label,
          zIndex: 900,
          opacity: v.stale ? 0.5 : 1,
          icon: icon(v, heading),
          label: v.label ? { text: v.label, color: "#e2e8f0", fontSize: "10px", fontWeight: "700", className: "gm-vehicle-label" } : undefined,
        });
        if (v.onClick) marker.addListener("click", v.onClick);
        vehicleRefs.current.set(v.id, { marker, lat: v.lat, lng: v.lng, heading, raf: null });
        return;
      }

      existing.marker.setIcon(icon(v, heading));
      existing.marker.setOpacity(v.stale ? 0.5 : 1);
      if (v.label) existing.marker.setTitle(v.label);

      const fromLat = existing.lat;
      const fromLng = existing.lng;
      const fromHeading = existing.heading;
      const dHeading = ((heading - fromHeading + 540) % 360) - 180;
      if (fromLat === v.lat && fromLng === v.lng && dHeading === 0) return;

      if (existing.raf) cancelAnimationFrame(existing.raf);
      const start = performance.now();
      const duration = 1200;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const lat = fromLat + (v.lat - fromLat) * ease;
        const lng = fromLng + (v.lng - fromLng) * ease;
        existing.marker.setPosition({ lat, lng });
        existing.marker.setIcon(icon(v, fromHeading + dHeading * ease));
        existing.lat = lat;
        existing.lng = lng;
        existing.heading = fromHeading + dHeading * ease;
        if (followVehicleId === v.id) map.panTo({ lat, lng });
        existing.raf = t < 1 ? requestAnimationFrame(step) : null;
        if (t >= 1) {
          existing.lat = v.lat;
          existing.lng = v.lng;
          existing.heading = heading;
        }
      };
      existing.raf = requestAnimationFrame(step);
    });

    // Remove vehicles that are no longer reported.
    vehicleRefs.current.forEach((entry, id) => {
      if (seen.has(id)) return;
      if (entry.raf) cancelAnimationFrame(entry.raf);
      entry.marker.setMap(null);
      vehicleRefs.current.delete(id);
    });
  }, [vehiclesKey, ready, followVehicleId]);

  // Tear every vehicle marker down on unmount.
  useEffect(() => {
    const store = vehicleRefs.current;
    return () => {
      store.forEach((e) => {
        if (e.raf) cancelAnimationFrame(e.raf);
        e.marker.setMap(null);
      });
      store.clear();
    };
  }, []);

  // Snap the camera onto a requested point (recenter buttons).
  useEffect(() => {
    if (!focus || !mapRef.current || !ready) return;
    mapRef.current.panTo({ lat: focus.lat, lng: focus.lng });
    if (focus.zoom) mapRef.current.setZoom(focus.zoom);
  }, [focus?.nonce, ready]);

  // Fit everything currently drawn (fit-route button).
  useEffect(() => {
    if (fitNonce == null || !mapRef.current || !ready || !boundsRef.current) return;
    mapRef.current.fitBounds(boundsRef.current);
  }, [fitNonce, ready]);


  if (error) {
    const first = markers[0];
    return (
      <div className={className ?? "h-full w-full"}>
        <MapFallback
          reason={error}
          lat={fallbackDetails?.lat ?? first?.lat ?? null}
          lng={fallbackDetails?.lng ?? first?.lng ?? null}
          accuracyMeters={fallbackDetails?.accuracyMeters ?? first?.accuracyMeters ?? null}
          updatedAt={fallbackDetails?.updatedAt ?? null}
          address={fallbackDetails?.address ?? null}
          incidentId={fallbackDetails?.incidentId ?? null}
          onRetry={retry}
        />
      </div>
    );
  }

  return (
    <div className={className ?? "h-full w-full"}>
      <div ref={ref} className="h-full w-full rounded-xl bg-muted" />
    </div>
  );

}
