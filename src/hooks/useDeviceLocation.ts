import { useCallback, useEffect, useState } from "react";
import type { Coords } from "@/lib/geolocation";

/** Local map positioning. This hook never uploads or shares a location. */
export function useDeviceLocation(enabled: boolean) {
  const [point, setPoint] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) { setError("Location is unavailable on this device."); return; }
    let cancelled = false;
    let hasFix = false;
    setError(null);
    const success = (position: GeolocationPosition) => {
      if (cancelled || !Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) return;
      hasFix = true;
      setError(null);
      setPoint((previous) => previous?.at && previous.at > position.timestamp ? previous : {
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy, heading: position.coords.heading,
        speed: position.coords.speed, at: position.timestamp,
      });
    };
    const fail = (failure: GeolocationPositionError) => {
      if (cancelled || (hasFix && failure.code !== 1)) return;
      if (failure.code === 1) {
        setPoint(null);
        setError("Allow location access in your browser settings, then tap My location.");
      } else setError("Waiting for your location. Check that location services are on, then tap My location.");
    };
    // Use a recent/coarse fix immediately while the precise watch warms up.
    navigator.geolocation.getCurrentPosition(success, fail, { enableHighAccuracy: false, maximumAge: 30_000, timeout: 6000 });
    const watcher = navigator.geolocation.watchPosition(success, fail, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15_000 });
    return () => { cancelled = true; navigator.geolocation.clearWatch(watcher); };
  }, [enabled, attempt]);

  return { point, error, retry };
}
