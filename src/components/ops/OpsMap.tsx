import { useMemo, useState } from "react";
import { GoogleMap, type LiveVehicle, type MapMarker, type MapRoute, type MapTypeId } from "@/components/GoogleMap";
import { Crosshair, Layers, LocateFixed, Maximize2, Minimize2, TrafficCone, Map as MapIcon, Satellite, Timer } from "lucide-react";
import { PRIORITY_HEX, UNIT_KIND, distanceKm, type Hospital, type Incident, type Unit } from "@/lib/ops";
import { useLiveRoute } from "@/hooks/useMaps";
import { useUnitTrack } from "@/hooks/useTracking";
import { GPS_STATE_META, gpsState } from "@/lib/tracking";
import { RoutePanel } from "@/components/ops/RoutePanel";
import { patientMapLabel, vehicleMapLabel } from "@/lib/map-labels";


type Props = {
  incidents: Incident[];
  units: Unit[];
  hospitals: Hospital[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  traffic: boolean;
  onToggleTraffic: () => void;
  showUnits: boolean;
  onToggleUnits: () => void;
  center: { lat: number; lng: number };
};

const UNIT_STATUS_HEX: Record<string, string> = {
  available: "#22c55e",
  en_route: "#eab308",
  on_scene: "#f97316",
  transporting: "#f97316",
  busy: "#f97316",
  offline: "#64748b",
};

const LEGEND = [
  { label: "Critical incident", hex: PRIORITY_HEX.critical },
  { label: "High", hex: PRIORITY_HEX.high },
  { label: "Medium", hex: PRIORITY_HEX.medium },
  { label: "Available unit", hex: UNIT_STATUS_HEX.available },
  { label: "Responding", hex: UNIT_STATUS_HEX.en_route },
  { label: "Busy / on scene", hex: UNIT_STATUS_HEX.on_scene },
  { label: "Hospital", hex: "#e2e8f0" },
];

export function OpsMap({
  incidents, units, hospitals, selectedId, onSelect, traffic, onToggleTraffic, showUnits, onToggleUnits, center,
}: Props) {
  const [mapTypeId, setMapTypeId] = useState<MapTypeId>(() => {
    if (typeof window === "undefined") return "hybrid";
    const saved = window.localStorage.getItem("beacon.mapType.v2");
    return saved === "roadmap" || saved === "hybrid" ? (saved as MapTypeId) : "hybrid";
  });
  const setMapType = (next: MapTypeId) => {
    setMapTypeId(next);
    try {
      window.localStorage.setItem("beacon.mapType.v2", next);
    } catch {
      /* storage unavailable */
    }
  };
  const [cluster, setCluster] = useState(true);
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const assigned = selected ? units.find((u) => u.id === selected.assigned_unit_id) ?? null : null;

  // Live GPS trail for the responding unit — the source of truth for its position.
  const { point: livePoint, trail } = useUnitTrack(assigned?.id ?? null, !!assigned);

  const unitPos = livePoint
    ? { lat: livePoint.lat, lng: livePoint.lng }
    : assigned?.latitude != null && assigned?.longitude != null
      ? { lat: assigned.latitude, lng: assigned.longitude }
      : null;

  const origin = unitPos;
  const destination = selected ? { lat: selected.latitude, lng: selected.longitude } : null;
  const { route, loading: routeLoading } = useLiveRoute(origin, destination, 10_000, selected?.id ?? null);

  const fix = gpsState(livePoint?.at ?? assigned?.last_location_update ?? null);
  const kmToScene = unitPos && destination ? distanceKm(unitPos, destination) : null;


  const markers: MapMarker[] = useMemo(() => {
    const incidentMarkers: MapMarker[] = incidents.map((i) => ({
      id: `inc-${i.id}`,
      image: "patient",
      lat: i.latitude,
      lng: i.longitude,
      title: `${i.incident_code ?? "Incident"} — ${i.patient_name ?? "Anonymous"}`,
      label: patientMapLabel(i, units),
      color: PRIORITY_HEX[i.priority] ?? PRIORITY_HEX.high,
      emphasis: i.id === selectedId,
      pulse: i.status === "active",
      accuracyMeters: i.id === selectedId ? i.accuracy ?? undefined : undefined,
      scale: i.id === selectedId ? 14 : 10,
      noCluster: i.priority === "critical" || !!i.assigned_unit_id,
      onClick: () => onSelect(i.id),
    }));

    const hospitalMarkers: MapMarker[] = hospitals.map((h) => ({
      id: `hosp-${h.id}`,
      lat: h.latitude,
      lng: h.longitude,
      title: `${h.name} — ${h.trauma_beds_available} trauma beds`,
      color: "#e2e8f0",
      glyph: "+",
      scale: 9,
    }));

    return [...hospitalMarkers, ...incidentMarkers];
  }, [incidents, hospitals, selectedId, onSelect, units]);

  // Every role-assigned vehicle with a real GPS fix, streamed live from the database.
  const vehicles: LiveVehicle[] = useMemo(() => {
    const list: LiveVehicle[] = [];
    if (showUnits) {
      for (const u of units) {
        if (u.id === assigned?.id || u.latitude == null || u.longitude == null || u.status === "offline") continue;
        const g = gpsState(u.last_location_update ?? null);
        list.push({
          id: u.id,
          lat: u.latitude,
          lng: u.longitude,
          heading: u.heading ?? 0,
          label: vehicleMapLabel(u, incidents),
          color: UNIT_STATUS_HEX[u.status] ?? UNIT_KIND[u.kind]?.hex ?? "#64748b",
          stale: g === "stale" || g === "lost",
          onClick: u.current_alert_id ? () => onSelect(u.current_alert_id!) : undefined,
        });
      }
    }
    if (assigned && unitPos) {
      list.push({
        id: assigned.id,
        lat: unitPos.lat,
        lng: unitPos.lng,
        heading: livePoint?.heading ?? assigned.heading ?? 0,
        label: vehicleMapLabel(assigned, incidents),
        color: UNIT_STATUS_HEX[assigned.status] ?? "#22d3ee",
        stale: fix === "stale" || fix === "lost",
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, incidents, showUnits, onSelect, assigned?.id, assigned?.call_sign, assigned?.status, unitPos?.lat, unitPos?.lng, livePoint?.heading, fix]);

  const routes: MapRoute[] = [
    ...(route?.polyline ? [{ id: "active-route", encoded: route.polyline, color: "#38bdf8", weight: 6 }] : []),
    ...(trail.length > 1 ? [{ id: "unit-trail", path: trail, color: "#22d3ee", weight: 3, dashed: true }] : []),
  ];

  const geofences = selected
    ? [{ id: "scene", lat: selected.latitude, lng: selected.longitude, radiusMeters: 500, color: PRIORITY_HEX[selected.priority] ?? "#ef4444", label: "Scene perimeter" }]
    : [];

  const etaMin = route ? Math.max(1, Math.round(route.durationSeconds / 60)) : null;

  const toggleClass = (on: boolean) =>
    `flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition ${
      on ? "bg-secondary text-secondary-foreground" : "bg-card/90 text-muted-foreground"
    }`;

  const recenterScene = () => {
    if (!selected) return;
    setFollow(false);
    setFocus({ lat: selected.latitude, lng: selected.longitude, zoom: 16, nonce: Date.now() });
  };

  return (
    <section
      aria-label="Live operations map"
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col overflow-auto border border-border bg-card"
          : "relative flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-card"
      }
    >
      <div className={expanded ? "order-2 min-h-[360px] flex-1" : "order-2 h-[46vh] min-h-[360px] shrink-0"}>
      <GoogleMap
        markers={markers}
        declutterLabels
        vehicles={vehicles}
        followVehicleId={follow && assigned ? assigned.id : null}
        focus={focus}
        fitNonce={fitNonce}
        routes={routes}
        geofences={geofences}
        center={center}
        zoom={12}
        dark
        traffic={traffic}
        cluster={cluster}
        mapTypeId={mapTypeId}
        fitToMarkers={false}
        className="h-full w-full"
        fallbackDetails={
          selected
            ? {
                lat: selected.latitude,
                lng: selected.longitude,
                accuracyMeters: selected.accuracy ?? null,
                updatedAt: selected.location_updated_at ?? selected.created_at ?? null,
                address: selected.address ?? null,
                incidentId: selected.incident_code ?? selected.id,
              }
            : undefined
        }
      />
      </div>

      <div className="order-1 flex flex-wrap items-start justify-between gap-3 border-b border-border p-3">
        <div className="pointer-events-auto rounded-lg border border-border bg-card/90 px-3 py-2 backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Live operations map</p>
          <p className="text-xs text-foreground">
            {incidents.length} incidents · {units.filter((u) => u.status !== "offline").length} units · {hospitals.length} hospitals
          </p>
          {etaMin != null && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-300">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              ETA {etaMin} min · {(route!.distanceMeters / 1000).toFixed(1)} km
            </p>
          )}
          {assigned && (
            <p className="mt-1 flex items-center gap-2 text-[10px]">
              <span className={`rounded-full px-1.5 py-0.5 font-semibold ${GPS_STATE_META[fix].chip}`}>
                {assigned.call_sign} · {GPS_STATE_META[fix].label}
              </span>
              {kmToScene != null && <span className="text-muted-foreground">{kmToScene.toFixed(2)} km to scene</span>}
            </p>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <button type="button" onClick={onToggleUnits} aria-pressed={showUnits} className={toggleClass(showUnits)}>
            <Layers className="h-4 w-4" /> Units
          </button>
          <button type="button" onClick={onToggleTraffic} aria-pressed={traffic} className={toggleClass(traffic)}>
            <TrafficCone className="h-4 w-4" /> Traffic
          </button>
          <button
            type="button"
            onClick={() => setMapType(mapTypeId === "roadmap" ? "hybrid" : "roadmap")}
            aria-pressed={mapTypeId !== "roadmap"}
            className={toggleClass(mapTypeId !== "roadmap")}
          >
            {mapTypeId === "roadmap" ? <Satellite className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
            {mapTypeId === "roadmap" ? "Satellite" : "Roadmap"}
          </button>
          <button type="button" onClick={() => setCluster((v) => !v)} aria-pressed={cluster} className={toggleClass(cluster)}>
            <Layers className="h-4 w-4" /> Cluster
          </button>
          <button
            type="button"
            onClick={() => setFollow((v) => !v)}
            aria-pressed={follow}
            disabled={!assigned}
            title={assigned ? "Follow the responding unit" : "No unit assigned"}
            className={`${toggleClass(follow && !!assigned)} disabled:opacity-40`}
          >
            <LocateFixed className="h-4 w-4" /> Follow
          </button>
          <button type="button" onClick={recenterScene} disabled={!selected} className={`${toggleClass(false)} disabled:opacity-40`}>
            <Crosshair className="h-4 w-4" /> Scene
          </button>
          <button type="button" onClick={() => { setFollow(false); setFitNonce((n) => n + 1); }} className={toggleClass(false)}>
            <Maximize2 className="h-4 w-4" /> Fit
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            className={toggleClass(expanded)}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {expanded ? "Exit" : "Full screen"}
          </button>
        </div>

      </div>

      <div className="order-3 px-3 pt-3">
        <RoutePanel route={route} loading={routeLoading} title={assigned ? `${assigned.call_sign} → scene` : "Active route"} />
      </div>

      <ul className="order-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-border px-3 py-3 text-[10px] text-muted-foreground">

        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.hex }} aria-hidden="true" />
            {l.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
