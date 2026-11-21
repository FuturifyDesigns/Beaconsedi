import { useCallback, useEffect, useRef, useState } from "react";
import { MapFallback, type MapFallbackDetails } from "@/components/MapFallback";

import { loadGoogleMaps, resetGoogleMapsLoader } from "@/lib/google-maps-loader";
import { decodePolyline } from "@/lib/polyline";
import { arrangeMapLabels } from "@/lib/map-label-layout";
import { createMapCameraPolicy } from "@/lib/map-camera";
export { loadGoogleMaps, resetGoogleMapsLoader } from "@/lib/google-maps-loader";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  /** A readable overhead patient/assignment label, separate from the tooltip. */
  label?: string;
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
  declutterLabels?: boolean;
};



/* ------------------------------ google typings ----------------------------- */

type LatLngLiteral = { lat: number; lng: number };
type GBounds = { extend: (point: LatLngLiteral) => void; isEmpty: () => boolean };
type GMapsGlobal = {
  maps: {
    Size: new (width: number, height: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    LatLng: new (lat: number, lng: number) => unknown;
    Map: new (el: Element, opts: Record<string, unknown>) => GMap;
    Marker: new (opts: Record<string, unknown>) => GMarker;
    Circle: new (opts: Record<string, unknown>) => GOverlay;
    Polyline: new (opts: Record<string, unknown>) => GOverlay;
    TrafficLayer: new () => { setMap: (m: GMap | null) => void };
    LatLngBounds: new () => GBounds;
    SymbolPath: { CIRCLE: unknown; FORWARD_CLOSED_ARROW: unknown };
    Animation: { DROP: unknown; BOUNCE: unknown };
    geometry?: { encoding?: { decodePath: (s: string) => { lat: () => number; lng: () => number }[] } };
  };
};
type GMap = {
  getProjection: () => { fromLatLngToPoint: (p: unknown) => { x: number; y: number }; fromPointToLatLng: (p: unknown) => unknown } | undefined;
  getCenter: () => unknown;
  getZoom: () => number;
  getDiv: () => HTMLElement;
  addListener: (event: string, cb: () => void) => { remove: () => void };
  setCenter: (l: LatLngLiteral) => void;
  panTo: (l: LatLngLiteral) => void;
  setZoom: (n: number) => void;
  fitBounds: (b: unknown) => void;
  setOptions: (o: Record<string, unknown>) => void;
};
type GMarker = {
  getMap: () => GMap | null;
  setMap: (m: GMap | null) => void;
  addListener: (event: string, cb: () => void) => void;
  setPosition: (l: LatLngLiteral) => void;
  setIcon: (i: unknown) => void;
  setTitle: (t: string) => void;
  setLabel: (label: Record<string, unknown> | null) => void;
  getPosition: () => { lat: () => number; lng: () => number };
  getIcon: () => Record<string, unknown>;
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
  mapTypeId = "roadmap",
  cluster = false,
  fallbackDetails,
  vehicles = [],
  followVehicleId = null,
  focus = null,
  fitNonce,
  declutterLabels = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRefs = useRef<GMarker[]>([]);
  const overlayRefs = useRef<GOverlay[]>([]);
  const clusterRef = useRef<{ clearMarkers: () => void; addMarkers: (markers: never) => void } | null>(null);
  const trafficRef = useRef<{ setMap: (m: GMap | null) => void } | null>(null);
  const boundsRef = useRef<GBounds | null>(null);
  const vehicleRefs = useRef<Map<string, { marker: GMarker; lat: number; lng: number; heading: number; raf: number | null }>>(new Map());
  const latestVehicles = useRef(vehicles);
  latestVehicles.current = vehicles;
  const camera = useRef(createMapCameraPolicy());
  const labelEntries = useRef(new Map<string, { marker: GMarker; text: string; icon: Record<string, unknown>; anchorX: number; anchorY: number; priority: number; color: string }>());
  const labelStems = useRef<GOverlay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const layoutLabels = useCallback(() => {
    if (!declutterLabels) return;
    const map = mapRef.current;
    const g = (window as unknown as { google?: GMapsGlobal }).google;
    const projection = map?.getProjection();
    if (!map || !g || !projection) return;
    const div = map.getDiv(), scale = 2 ** map.getZoom();
    const middle = projection.fromLatLngToPoint(map.getCenter());
    const measured = new Map([...div.querySelectorAll<HTMLElement>(".gm-patient-label, .gm-vehicle-label")]
      .map(element => [element.textContent, element.getBoundingClientRect()]));
    const boxes = [...labelEntries.current].flatMap(([id, entry]) => {
      if (!entry.marker.getMap()) return [];
      const point = projection.fromLatLngToPoint(entry.marker.getPosition());
      const x = (point.x-middle.x)*scale+div.clientWidth/2, y = (point.y-middle.y)*scale+div.clientHeight/2;
      if (x < -40 || y < -40 || x > div.clientWidth+40 || y > div.clientHeight+40) return [];
      const lines = entry.text.split("\n");
      const actual = measured.get(entry.text);
      const lineCount = lines.reduce((count, line) => count+Math.max(1, Math.ceil(line.length*6.5/222)), 0);
      return [{ id, x, y, width: actual?.width || Math.min(240, Math.max(95, Math.max(...lines.map(line => line.length))*6.5+18)), height: actual?.height || lineCount*14+10, priority: entry.priority, clearance: entry.anchorY+19 }];
    });
    labelStems.current.forEach(stem => stem.setMap(null)); labelStems.current = [];
    for (const placed of arrangeMapLabels(boxes, div.clientWidth, div.clientHeight)) {
      const entry = labelEntries.current.get(placed.id)!;
      const dx = placed.x-placed.markerX, dy = placed.y-placed.markerY;
      entry.marker.setIcon({ ...entry.icon, labelOrigin: new g.maps.Point(entry.anchorX+dx, entry.anchorY+dy) });
      if (Math.abs(dx) > 6 || Math.abs(dy+Math.max(46, entry.anchorY+19)) > 6) {
        const endY = placed.y + (placed.y < placed.markerY ? placed.height/2 : -placed.height/2);
        const end = projection.fromPointToLatLng(new g.maps.Point(middle.x+(placed.x-div.clientWidth/2)/scale, middle.y+(endY-div.clientHeight/2)/scale));
        labelStems.current.push(new g.maps.Polyline({ map, path: [entry.marker.getPosition(), end], strokeColor: entry.color, strokeOpacity: .75, strokeWeight: 1, clickable: false, zIndex: 6 }));
      }
    }
  }, [declutterLabels]);

  const retry = useCallback(() => {
    // Error fallback replaces the map element. Never reuse a map attached to its old node.
    clusterRef.current?.clearMarkers();
    clusterRef.current = null;
    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];
    overlayRefs.current.forEach((overlay) => overlay.setMap(null));
    overlayRefs.current = [];
    vehicleRefs.current.forEach((vehicle) => { if (vehicle.raf !== null) cancelAnimationFrame(vehicle.raf); vehicle.marker.setMap(null); });
    vehicleRefs.current.clear();
    trafficRef.current?.setMap(null);
    trafficRef.current = null;
    mapRef.current = null;
    boundsRef.current = null;
    camera.current.reset();
    labelEntries.current.clear(); labelStems.current.forEach(stem => stem.setMap(null)); labelStems.current = [];
    setReady(false);
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

        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(ref.current, {
            center: center ?? { lat: markers[0]?.lat ?? -24.6282, lng: markers[0]?.lng ?? 25.9231 },
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
        setReady(true);

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
        [...labelEntries.current.keys()].filter(key => key.startsWith("patient:")).forEach(key => labelEntries.current.delete(key));
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
            label: m.label ? { text: m.label, color: "#ffffff", fontSize: "11px", fontWeight: "600", className: "gm-patient-label" } : m.glyph ? { text: m.glyph, color: "#ffffff", fontSize: "10px", fontWeight: "700" } : undefined,
            icon: m.image ? {
              url: import.meta.env.BASE_URL + "map-icons/" + (m.image === "patient" ? "patient-beacon-round.png" : "ambulance.png"),
              scaledSize: new g.maps.Size(m.image === "patient" ? 48 : 64, m.image === "patient" ? 44 : 43),
              anchor: new g.maps.Point(m.image === "patient" ? 24 : 32, m.image === "patient" ? 44 : 22),
              labelOrigin: new g.maps.Point(m.image === "patient" ? 24 : 32, -19),
            } : {
              path: g.maps.SymbolPath.CIRCLE,
              scale: m.scale ?? (m.emphasis ? 13 : 9),
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: m.emphasis ? 3 : 2,
            },
          });
          marker.addListener("click", () => { camera.current.interact(); m.onClick?.(); });
          if (m.label) labelEntries.current.set(`patient:${m.id}`, { marker, text: m.label, icon: marker.getIcon(), anchorX: m.image === "patient" ? 24 : 32, anchorY: m.image === "patient" ? 44 : 22, priority: m.emphasis ? 3 : 2, color: "#fb7185" });
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

        if (cluster && clusterable.length > 1) {
          try {
            if (!clusterRef.current) {
              const { MarkerClusterer } = await import("@googlemaps/markerclusterer");
              if (cancelled) return;
              clusterable.forEach((m) => m.setMap(null));
              clusterRef.current = new MarkerClusterer({
                map: map as never, markers: clusterable as never,
                onClusterClick: (_event, group) => {
                  camera.current.interact();
                  map.panTo({ lat: group.position.lat(), lng: group.position.lng() });
                  map.setZoom(Math.min(21, map.getZoom() + 2));
                },
              });
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
          if (!path.length && r.encoded) path = decodePolyline(r.encoded);
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

        vehicles.forEach(vehicle => bounds.extend({ lat: vehicle.lat, lng: vehicle.lng }));
        boundsRef.current = bounds;
        layoutLabels();

        const initialView = camera.current.initialView(fitToMarkers, markers.length, vehicles.length);
        if (initialView === "fit") {
          map.fitBounds(bounds);
        } else if (initialView === "center") {
          map.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
          map.setZoom(zoom);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setReady(false);
        console.error("[beacon:maps] load failed", err);
        setError(err instanceof Error ? err.message : "Map failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [markers, center?.lat, center?.lng, zoom, fitToMarkers, traffic, dark, mapTypeId, cluster, routesKey, fencesKey, vehiclesKey, retryKey, layoutLabels]);

  // Recenter when the caller moves the focus point.
  useEffect(() => {
    if (!center || !mapRef.current || !ready || followVehicleId || (fitToMarkers && vehicles.length > 0)) return;
    mapRef.current.setCenter(center);
  }, [center?.lat, center?.lng, ready, followVehicleId, fitToMarkers, vehicles.length]);

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
      labelOrigin: new g.maps.Point(32, -19),
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
        marker.addListener("click", () => { camera.current.interact(); latestVehicles.current.find(vehicle => vehicle.id === v.id)?.onClick?.(); });
        if (v.label) labelEntries.current.set(`vehicle:${v.id}`, { marker, text: v.label, icon: icon(v, heading), anchorX: 32, anchorY: 22, priority: 1, color: "#7dd3fc" });
        vehicleRefs.current.set(v.id, { marker, lat: v.lat, lng: v.lng, heading, raf: null });
        return;
      }

      existing.marker.setIcon(icon(v, heading));
      existing.marker.setOpacity(v.stale ? 0.5 : 1);
      if (v.label) existing.marker.setTitle(v.label);
      existing.marker.setLabel(v.label ? { text: v.label, color: "#e2e8f0", fontSize: "10px", fontWeight: "700", className: "gm-vehicle-label" } : null);
      const label = labelEntries.current.get(`vehicle:${v.id}`);
      if (label && v.label) label.text = v.label;

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
        existing.lat = lat;
        existing.lng = lng;
        existing.heading = fromHeading + dHeading * ease;
        if (followVehicleId === v.id) map.panTo({ lat, lng });
        existing.raf = t < 1 ? requestAnimationFrame(step) : null;
        if (t >= 1) {
          existing.lat = v.lat;
          existing.lng = v.lng;
          existing.heading = heading;
          layoutLabels();
        }
      };
      existing.raf = requestAnimationFrame(step);
    });

    // Remove vehicles that are no longer reported.
    vehicleRefs.current.forEach((entry, id) => {
      if (seen.has(id)) return;
      if (entry.raf) cancelAnimationFrame(entry.raf);
      entry.marker.setMap(null);
      labelEntries.current.delete(`vehicle:${id}`);
      vehicleRefs.current.delete(id);
    });
    layoutLabels();
  }, [vehiclesKey, ready, followVehicleId, layoutLabels]);

  useEffect(() => {
    if (!ready || !mapRef.current || !declutterLabels) return;
    const listener = mapRef.current.addListener("idle", layoutLabels);
    layoutLabels();
    return () => listener.remove();
  }, [ready, declutterLabels, layoutLabels]);

  useEffect(() => {
    const div = mapRef.current?.getDiv();
    if (!ready || !div) return;
    const interact = () => camera.current.interact();
    for (const event of ["pointerdown", "wheel", "keydown"]) div.addEventListener(event, interact, { capture: true, passive: true });
    return () => { for (const event of ["pointerdown", "wheel", "keydown"]) div.removeEventListener(event, interact, true); };
  }, [ready]);

  // Tear every vehicle marker down on unmount.
  useEffect(() => {
    const store = vehicleRefs.current;
    return () => {
      store.forEach((e) => {
        if (e.raf) cancelAnimationFrame(e.raf);
        e.marker.setMap(null);
      });
      store.clear();
      labelStems.current.forEach(stem => stem.setMap(null));
      labelEntries.current.clear();
    };
  }, []);

  // Snap the camera onto a requested point (recenter buttons).
  useEffect(() => {
    if (!focus || !mapRef.current || !ready) return;
    camera.current.interact();
    mapRef.current.panTo({ lat: focus.lat, lng: focus.lng });
    if (focus.zoom) mapRef.current.setZoom(focus.zoom);
  }, [focus?.nonce, ready]);

  // Fit everything currently drawn (fit-route button).
  useEffect(() => {
    if (!fitNonce || !mapRef.current || !ready || !boundsRef.current) return;
    camera.current.interact();
    vehicles.forEach(vehicle => boundsRef.current!.extend({ lat: vehicle.lat, lng: vehicle.lng }));
    if (boundsRef.current.isEmpty()) return;
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
    <div className={`relative ${className ?? "h-full w-full"}`} aria-busy={!ready}>
      {!ready && <div role="status" className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-muted/90 text-sm text-muted-foreground">Loading map…</div>}
      <div ref={ref} className="h-full w-full rounded-xl bg-muted" />
    </div>
  );

}
