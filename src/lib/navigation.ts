import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/ops";
import { getCurrentPosition } from "@/lib/geolocation";

export type Destination = { latitude: number; longitude: number };

export function isValidCoords(d: Partial<Destination> | null | undefined): d is Destination {
  return (
    !!d &&
    typeof d.latitude === "number" &&
    typeof d.longitude === "number" &&
    Number.isFinite(d.latitude) &&
    Number.isFinite(d.longitude) &&
    Math.abs(d.latitude) <= 90 &&
    Math.abs(d.longitude) <= 180 &&
    !(d.latitude === 0 && d.longitude === 0)
  );
}

/** Full-precision "lat,lng" string Google Maps treats as an exact point, never a snapped place. */
export function coordString({ latitude, longitude }: Destination): string {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/** Browser Google Maps directions — works on every platform. */
export function webNavigationUrl(d: Destination, origin?: Destination | null): string {
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    dir_action: "navigate",
    destination: coordString(d),
  });
  if (origin) params.set("origin", coordString(origin));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export type Platform = "android" | "ios" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)) return "ios";
  return "desktop";
}

/** Native Google Maps app deep link for the current platform, if any. */
export function nativeNavigationUrl(
  d: Destination,
  platform = detectPlatform(),
  origin?: Destination | null,
): string | null {
  const dest = coordString(d);
  if (platform === "android") return `google.navigation:q=${dest}&mode=d`;
  if (platform === "ios") {
    const saddr = origin ? `&saddr=${coordString(origin)}` : "";
    return `comgooglemaps://?daddr=${dest}${saddr}&directionsmode=driving&nav=1`;
  }
  return null;
}

/**
 * Blue Light Maps deep links — the officially documented integration surface.
 * Source: https://docs.bluelightmaps.com/developers/deep-links/
 * Blue-light routing profiles use emergency exemptions (bus lanes, restricted
 * turns, contraflow) where Blue Light Maps has responder data.
 */
export type BlmVehicleType =
  | "vehicle"
  | "truck"
  | "smoothtruck"
  | "largetruck"
  | "responsecar"
  | "responsetruck"
  | "smoothresponsetruck"
  | "largeresponsetruck";

/** Start blue-light turn-by-turn navigation in the Blue Light Maps app. */
export function blmNavigationUrl(
  d: Destination,
  label?: string,
  type: BlmVehicleType = "responsetruck",
): string {
  const dest = coordString(d);
  const name = label ? `&daddr=${encodeURIComponent(label)}` : "";
  return `blm://nav?v=1&dll=${dest}${name}&type=${type}`;
}

/** Show a location pin in the Blue Light Maps app without starting navigation. */
export function blmMapUrl(d: Destination, label?: string): string {
  const name = label ? `&n=${encodeURIComponent(label)}` : "";
  return `blm://map?v=1&ll=${coordString(d)}${name}`;
}

/**
 * Opens turn-by-turn navigation. Tries the native Google Maps app on mobile and
 * falls back to the browser version when the app doesn't take over the page.
 */
export function openNavigation(d: Destination, origin?: Destination | null) {
  const web = webNavigationUrl(d, origin);
  const native = nativeNavigationUrl(d, detectPlatform(), origin);

  if (!native) {
    window.open(web, "_blank", "noopener,noreferrer");
    return;
  }

  let handedOff = false;
  const onHide = () => {
    handedOff = true;
  };
  document.addEventListener("visibilitychange", onHide, { once: true });
  window.addEventListener("pagehide", onHide, { once: true });

  window.location.href = native;
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    if (!handedOff && !document.hidden) window.location.href = web;
  }, 1200);
}

/**
 * Opens blue-light turn-by-turn navigation in the Blue Light Maps app.
 * Blue Light Maps has no web version, so when the app is not installed the
 * documented fallback is browser Google Maps directions to the same point.
 */
export function openBlueLightNavigation(d: Destination, label?: string, origin?: Destination | null) {
  const fallback = webNavigationUrl(d, origin);
  const blm = blmNavigationUrl(d, label);

  let handedOff = false;
  const onHide = () => {
    handedOff = true;
  };
  document.addEventListener("visibilitychange", onHide, { once: true });
  window.addEventListener("pagehide", onHide, { once: true });

  window.location.href = blm;
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
    if (!handedOff && !document.hidden) window.location.href = fallback;
  }, 1500);
}

export class NavigationError extends Error {}

/** Best-effort responder position so the route starts from the vehicle, not a guessed origin. */
async function currentOrigin(): Promise<Destination | null> {
  try {
    const pos = await Promise.race([
      getCurrentPosition(),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    if (!pos) return null;
    return { latitude: pos.latitude, longitude: pos.longitude };
  } catch {
    return null;
  }
}

export type NavigationProvider = "bluelight" | "google";

/**
 * Fetches the freshest patient coordinates for an incident, validates them,
 * writes an audit entry and launches a routed navigation from the responder's position.
 * Provider "bluelight" hands off to the Blue Light Maps app (blue-light routing);
 * "google" uses the Google Maps app or browser directions.
 */
export async function navigateToIncident(
  incidentId: string,
  opts?: {
    origin?: Destination | null;
    skipOriginLookup?: boolean;
    provider?: NavigationProvider;
    label?: string;
  },
): Promise<Destination & { updatedAt: string | null }> {
  const { data, error } = await supabase
    .from("alerts")
    .select("id, latitude, longitude, accuracy, updated_at")
    .eq("id", incidentId)
    .maybeSingle();

  if (error) throw new NavigationError("Unable to retrieve patient location.");
  if (!data || !isValidCoords(data)) throw new NavigationError("Unable to retrieve patient location.");

  const dest: Destination = { latitude: data.latitude, longitude: data.longitude };
  const origin = opts?.origin ?? (opts?.skipOriginLookup ? null : await currentOrigin());
  const provider: NavigationProvider = opts?.provider ?? "google";
  const label = opts?.label ?? `SOS ${incidentId.slice(0, 8).toUpperCase()}`;

  if (provider === "bluelight") {
    openBlueLightNavigation(dest, label, origin);
  } else {
    openNavigation(dest, origin);
  }

  void logAudit("incident_navigate", "alert", incidentId, {
    destination: coordString(dest),
    origin: origin ? coordString(origin) : null,
    accuracy_meters: (data as { accuracy?: number | null }).accuracy ?? null,
    platform: detectPlatform(),
    provider,
    at: new Date().toISOString(),
  });

  return { ...dest, updatedAt: (data as { updated_at?: string }).updated_at ?? null };
}
