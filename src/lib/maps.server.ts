/** Server-only Google Maps Platform gateway helpers. */
import { coalesceMapRequest } from "@/lib/map-request-control";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const DIRECT_ENDPOINTS: Record<string, string> = {
  maps: "https://maps.googleapis.com/maps/",
  places: "https://places.googleapis.com/",
  routes: "https://routes.googleapis.com/",
  roads: "https://roads.googleapis.com/",
  weather: "https://weather.googleapis.com/",
};

function explain403(body: string): string {
  if (body.includes("API_KEY_HTTP_REFERRER_BLOCKED")) {
    return "Google Maps needs a separate server key without website referrer restrictions.";
  }
  if (body.includes("API_KEY_SERVICE_BLOCKED")) {
    return "Google Maps server key does not allow this API. In Google Cloud Console, add this Maps API to the server key's allowed-APIs list.";
  }
  return "Google Maps request was denied (403). Check the server key's restrictions in Google Cloud Console.";
}

export async function gmaps<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  return coalesceMapRequest(JSON.stringify([path, init]), () => requestGoogleMaps<T>(path, init));
}

async function requestGoogleMaps<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!mapsKey) throw new Error("Google Maps server key is not configured");
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const [service, ...segments] = path.split("/");
  const endpoint = DIRECT_ENDPOINTS[service];
  if (!endpoint) throw new Error("Unsupported Google Maps service");
  const url = new URL(lovableKey ? GATEWAY_URL + "/" + path : segments.join("/"), endpoint);
  const headers = new Headers(init.headers);
  if (lovableKey) {
    headers.set("Authorization", "Bearer " + lovableKey);
    headers.set("X-Connection-Api-Key", mapsKey);
  } else if (service === "maps" || service === "roads" || service === "weather") {
    url.searchParams.set("key", mapsKey);
  } else {
    headers.set("X-Goog-Api-Key", mapsKey);
  }
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Google Maps " + service + " request failed [" + res.status + "]");
    if (res.status === 403) throw new Error(explain403(text));
    throw new Error(`Google Maps request failed [${res.status}]`);
  }
  return (await res.json()) as T;
}

/* --------------------------- tiny in-memory cache -------------------------- */

const cache = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    oldest.forEach(([k]) => cache.delete(k));
  }
  return value;
}
