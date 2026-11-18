import { detectPlatform, type Platform } from "@/lib/navigation";

export type LocationBlockReason =
  | "unsupported"
  | "insecure_context"
  | "denied"
  | "services_off"
  | "timeout";

export class LocationPermissionError extends Error {
  constructor(
    public reason: LocationBlockReason,
    message: string,
  ) {
    super(message);
    this.name = "LocationPermissionError";
  }
}

export const REASON_TITLE: Record<LocationBlockReason, string> = {
  unsupported: "Location not supported",
  insecure_context: "Secure connection required",
  denied: "Location permission blocked",
  services_off: "Location services are off",
  timeout: "Couldn't get a GPS fix",
};

/** Step-by-step recovery instructions per platform and failure reason. */
export function permissionInstructions(
  reason: LocationBlockReason,
  platform: Platform = detectPlatform(),
): string[] {
  if (reason === "unsupported")
    return ["This browser can't provide GPS. Open BEACON SEDI in Chrome or Safari on a device with location hardware."];
  if (reason === "insecure_context")
    return ["Location is only available over HTTPS. Reload BEACON SEDI using an https:// address."];
  if (reason === "timeout")
    return [
      "Move to an open area away from buildings or metal roofing.",
      "Confirm GPS (not just Wi-Fi positioning) is enabled.",
      "Wait a few seconds and press Navigate again.",
    ];

  if (platform === "android")
    return [
      "Open Settings → Location and turn Use location ON.",
      "Set Location accuracy / Google Location Accuracy to ON.",
      "In Chrome: tap the ⋮ menu → Settings → Site settings → Location → allow this site.",
      "Return to BEACON SEDI and press Navigate again.",
    ];
  if (platform === "ios")
    return [
      "Open Settings → Privacy & Security → Location Services and turn it ON.",
      "Scroll to your browser (Safari/Chrome) → set to While Using the App.",
      "Enable Precise Location.",
      "Return to BEACON SEDI and press Navigate again.",
    ];
  return [
    "Enable location services in your operating system settings.",
    "Click the padlock/location icon in the browser address bar and allow location for this site.",
    "Reload the page and press Navigate again.",
  ];
}

/** Reads the Permissions API without prompting. Returns null when unknown. */
export async function readPermissionState(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

function classify(err: unknown): LocationBlockReason {
  const code = (err as GeolocationPositionError | undefined)?.code;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (code === 1 || /denied|permission/i.test(msg)) return "denied";
  if (code === 3 || /timeout|timed out/i.test(msg)) return "timeout";
  if (code === 2 || /unavailable|position/i.test(msg)) return "services_off";
  return "services_off";
}

/**
 * Verifies the device can actually produce a fix before navigation launches.
 * Throws a LocationPermissionError describing exactly what the responder must fix.
 */
export async function ensureLocationAvailable(timeoutMs = 8000): Promise<GeolocationCoordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation)
    throw new LocationPermissionError("unsupported", "Geolocation is not available on this device.");
  if (typeof window !== "undefined" && !window.isSecureContext)
    throw new LocationPermissionError("insecure_context", "Location requires a secure (HTTPS) connection.");

  const state = await readPermissionState();
  if (state === "denied")
    throw new LocationPermissionError("denied", "Location permission is blocked for this site.");

  return await new Promise<GeolocationCoordinates>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new LocationPermissionError(classify(err), err.message || "Location unavailable.")),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
