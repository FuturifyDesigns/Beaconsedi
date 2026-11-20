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
  const loaded = typeof window !== "undefined" &&
    typeof (window as unknown as { google?: { maps?: { Map?: unknown } } }).google?.maps?.Map === "function";
  clearPendingLoader(!loaded);
  loadPromise = null;
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (loadPromise) return loadPromise;
  const w = window as unknown as { google?: { maps?: { Map?: unknown } } };
  if (typeof w.google?.maps?.Map === "function") return Promise.resolve();
  if (!BROWSER_KEY) return Promise.reject(new Error("Google Maps key not configured"));

  loadPromise = new Promise((resolve, reject) => {
    const loadAttempt = (attempt: number) => {
      const cbName = "__beaconGoogleMapsReady_" + Math.random().toString(36).slice(2);
      loaderCallback = cbName;
      const script = document.createElement("script");
      loaderScript = script;
      const channel = CHANNEL ? `&channel=${encodeURIComponent(CHANNEL)}` : "";
      script.id = "beacon-google-maps";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&callback=${cbName}${channel}`;
      script.async = true;
      script.defer = true;

      let settled = false;
      const timeout = window.setTimeout(() => fail("Google Maps took too long to respond"), 12_000);
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
        if (attempt < 1 && navigator.onLine) {
          window.setTimeout(() => loadAttempt(attempt + 1), 400);
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
