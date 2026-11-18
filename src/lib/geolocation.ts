export type Coords = { latitude: number; longitude: number; accuracy: number; heading?: number | null; speed?: number | null; at?: number };

export type GpsQuality = "excellent" | "good" | "fair" | "poor" | "unavailable";

export function gpsQuality(accuracy: number | null | undefined): GpsQuality {
  if (accuracy == null || !Number.isFinite(accuracy)) return "unavailable";
  if (accuracy <= 5) return "excellent";
  if (accuracy <= 10) return "good";
  if (accuracy <= 30) return "fair";
  return "poor";
}

export const GPS_QUALITY_META: Record<GpsQuality, { label: string; hex: string; className: string }> = {
  excellent: { label: "Excellent GPS", hex: "#22c55e", className: "text-success" },
  good: { label: "Good GPS", hex: "#22c55e", className: "text-success" },
  fair: { label: "Fair GPS", hex: "#f59e0b", className: "text-warning" },
  poor: { label: "Weak GPS", hex: "#ef4444", className: "text-emergency" },
  unavailable: { label: "No GPS", hex: "#94a3b8", className: "text-muted-foreground" },
};

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          at: pos.timestamp,
        }),
      (err) => reject(new Error(err.message || "Failed to get location")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function watchPosition(cb: (c: Coords) => void, onError?: (e: Error) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError?.(new Error("Geolocation unavailable"));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      cb({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        at: pos.timestamp,
      }),
    (err) => onError?.(new Error(err.message)),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/**
 * 1-D Kalman filter over lat/lng, weighted by reported accuracy. Removes the
 * "jumping pin" effect while still converging quickly on a real move.
 */
export class LocationSmoother {
  private lat = 0;
  private lng = 0;
  private variance = -1;
  private at = 0;
  /** metres² per second of assumed movement noise */
  constructor(private processNoise = 3) {}

  reset() {
    this.variance = -1;
  }

  filter(c: Coords): Coords {
    const accuracy = Math.max(1, c.accuracy || 1);
    const now = c.at ?? Date.now();
    if (this.variance < 0) {
      this.lat = c.latitude;
      this.lng = c.longitude;
      this.variance = accuracy * accuracy;
      this.at = now;
      return { ...c, latitude: this.lat, longitude: this.lng };
    }
    const dt = Math.max(0, (now - this.at) / 1000);
    this.variance += dt * this.processNoise * this.processNoise;
    this.at = now;

    const k = this.variance / (this.variance + accuracy * accuracy);
    this.lat += k * (c.latitude - this.lat);
    this.lng += k * (c.longitude - this.lng);
    this.variance *= 1 - k;

    return {
      ...c,
      latitude: this.lat,
      longitude: this.lng,
      accuracy: Math.max(1, Math.sqrt(this.variance)),
    };
  }
}

/** watchPosition with Kalman smoothing and outlier rejection. */
export function watchSmoothed(
  cb: (c: Coords, quality: GpsQuality) => void,
  onError?: (e: Error) => void,
): () => void {
  const smoother = new LocationSmoother();
  let last: Coords | null = null;
  return watchPosition((raw) => {
    // reject implausible jumps (>300 m/s) coming from a bad fix
    if (last && last.at && raw.at) {
      const dt = Math.max(1, (raw.at - last.at) / 1000);
      const dm = haversineMeters(last, raw);
      if (dm / dt > 300) return;
    }
    last = raw;
    const s = smoother.filter(raw);
    cb(s, gpsQuality(raw.accuracy));
  }, onError);
}

export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
