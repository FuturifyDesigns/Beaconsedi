import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export type PlaceResult = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  openNow: boolean | null;
  kind: "hospital" | "police" | "fire_station" | "landmark";
};

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds: number | null;
  polyline: string | null;
  steps: { instruction: string; distanceMeters: number; durationSeconds: number }[];
  summary: string | null;
};

/* ------------------------------ reverse geocode ---------------------------- */

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => point.parse(d))
  .handler(async ({ data }) => {
    const { gmaps, cached } = await import("./maps.server");
    const key = `rg:${data.lat.toFixed(5)},${data.lng.toFixed(5)}`;
    return cached(key, 5 * 60_000, async () => {
      const res = await gmaps<{
        status: string;
        results: { formatted_address: string; place_id: string; types: string[] }[];
      }>(`maps/api/geocode/json?latlng=${data.lat},${data.lng}&region=bw&language=en`);
      const primary = res.results?.[0] ?? null;
      const route = res.results?.find((r) => r.types.includes("route"))?.formatted_address ?? null;
      return {
        address: primary?.formatted_address ?? null,
        placeId: primary?.place_id ?? null,
        nearestRoad: route,
        alternatives: (res.results ?? []).slice(1, 4).map((r) => r.formatted_address),
      };
    });
  });

/* ------------------------------ nearby places ------------------------------ */

const nearbyInput = point.extend({
  radiusMeters: z.number().min(100).max(50_000).default(6000),
  kinds: z.array(z.enum(["hospital", "police", "fire_station", "landmark"])).default(["hospital", "police", "fire_station"]),
});

const TYPE_MAP: Record<string, string[]> = {
  hospital: ["hospital"],
  police: ["police"],
  fire_station: ["fire_station"],
  landmark: ["tourist_attraction", "shopping_mall", "school"],
};

export const nearbyEmergencyPlaces = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => nearbyInput.parse(d))
  .handler(async ({ data }): Promise<PlaceResult[]> => {
    const { gmaps, cached } = await import("./maps.server");
    const key = `np:${data.lat.toFixed(3)},${data.lng.toFixed(3)}:${data.radiusMeters}:${data.kinds.join(",")}`;
    return cached(key, 10 * 60_000, async () => {
      const out: PlaceResult[] = [];
      for (const kind of data.kinds) {
        const res = await gmaps<{
          places?: {
            id: string;
            displayName?: { text: string };
            formattedAddress?: string;
            location?: { latitude: number; longitude: number };
            nationalPhoneNumber?: string;
            currentOpeningHours?: { openNow?: boolean };
          }[];
        }>("places/v1/places:searchNearby", {
          method: "POST",
          headers: {
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.currentOpeningHours.openNow",
          },
          body: {
            includedTypes: TYPE_MAP[kind],
            maxResultCount: kind === "landmark" ? 5 : 6,
            languageCode: "en",
            regionCode: "BW",
            locationRestriction: {
              circle: { center: { latitude: data.lat, longitude: data.lng }, radius: data.radiusMeters },
            },
          },
        });
        for (const p of res.places ?? []) {
          if (!p.location) continue;
          out.push({
            id: p.id,
            name: p.displayName?.text ?? "Unknown",
            address: p.formattedAddress ?? null,
            lat: p.location.latitude,
            lng: p.location.longitude,
            phone: p.nationalPhoneNumber ?? null,
            openNow: p.currentOpeningHours?.openNow ?? null,
            kind,
          });
        }
      }
      return out;
    });
  });

/* ---------------------------------- route ---------------------------------- */

const routeInput = z.object({
  origin: point,
  destination: point,
  emergency: z.boolean().default(true),
  alternatives: z.boolean().default(false),
});

export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => routeInput.parse(d))
  .handler(async ({ data }): Promise<RouteResult | null> => {
    const { gmaps } = await import("./maps.server");
    const res = await gmaps<{
      routes?: {
        distanceMeters?: number;
        duration?: string;
        staticDuration?: string;
        polyline?: { encodedPolyline?: string };
        description?: string;
        legs?: {
          steps?: {
            navigationInstruction?: { instructions?: string };
            distanceMeters?: number;
            staticDuration?: string;
          }[];
        }[];
      }[];
    }>("routes/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.description,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration",
      },
      body: {
        origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
        destination: { location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        computeAlternativeRoutes: data.alternatives,
        languageCode: "en",
        units: "METRIC",
      },
    });

    const r = res.routes?.[0];
    if (!r) return null;
    const secs = (v?: string) => (v ? Number(v.replace("s", "")) : 0);
    return {
      distanceMeters: r.distanceMeters ?? 0,
      durationSeconds: secs(r.duration),
      durationInTrafficSeconds: r.staticDuration ? secs(r.duration) : null,
      polyline: r.polyline?.encodedPolyline ?? null,
      summary: r.description ?? null,
      steps: (r.legs?.[0]?.steps ?? []).map((s) => ({
        instruction: s.navigationInstruction?.instructions ?? "Continue",
        distanceMeters: s.distanceMeters ?? 0,
        durationSeconds: secs(s.staticDuration),
      })),
    };
  });

/* ------------------------------ distance matrix ---------------------------- */

const matrixInput = z.object({
  origins: z.array(point).min(1).max(20),
  destination: point,
});

export const travelMatrix = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => matrixInput.parse(d))
  .handler(async ({ data }) => {
    const { gmaps } = await import("./maps.server");
    const res = await gmaps<
      { originIndex?: number; distanceMeters?: number; duration?: string; condition?: string }[]
    >("routes/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: { "X-Goog-FieldMask": "originIndex,distanceMeters,duration,condition" },
      body: {
        origins: data.origins.map((o) => ({
          waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
        })),
        destinations: [
          { waypoint: { location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } } } },
        ],
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      },
    });
    return (Array.isArray(res) ? res : []).map((r) => ({
      originIndex: r.originIndex ?? 0,
      distanceMeters: r.distanceMeters ?? 0,
      durationSeconds: r.duration ? Number(String(r.duration).replace("s", "")) : 0,
      ok: (r.condition ?? "ROUTE_EXISTS") === "ROUTE_EXISTS",
    }));
  });

/* --------------------------------- roads ----------------------------------- */

export const snapToRoad = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => point.parse(d))
  .handler(async ({ data }) => {
    const { gmaps } = await import("./maps.server");
    const res = await gmaps<{
      snappedPoints?: { location: { latitude: number; longitude: number } }[];
    }>(`roads/v1/nearestRoads?points=${data.lat},${data.lng}`);
    const p = res.snappedPoints?.[0]?.location;
    return p ? { lat: p.latitude, lng: p.longitude } : null;
  });

/* -------------------------------- weather ---------------------------------- */

export type WeatherNow = {
  temperatureC: number | null;
  windKph: number | null;
  precipitationMm: number | null;
  description: string | null;
};

export const currentWeather = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => point.parse(d))
  .handler(async ({ data }): Promise<WeatherNow> => {
    const { gmaps, cached } = await import("./maps.server");
    const key = `wx:${data.lat.toFixed(2)},${data.lng.toFixed(2)}`;
    return cached(key, 15 * 60_000, async () => {
      const res = await gmaps<{
        temperature?: { degrees?: number };
        wind?: { speed?: { value?: number } };
        precipitation?: { qpf?: { quantity?: number } };
        weatherCondition?: { description?: { text?: string } };
      }>(`weather/v1/currentConditions:lookup?location.latitude=${data.lat}&location.longitude=${data.lng}&unitsSystem=METRIC`);
      return {
        temperatureC: res.temperature?.degrees ?? null,
        windKph: res.wind?.speed?.value ?? null,
        precipitationMm: res.precipitation?.qpf?.quantity ?? null,
        description: res.weatherCondition?.description?.text ?? null,
      };
    });
  });
