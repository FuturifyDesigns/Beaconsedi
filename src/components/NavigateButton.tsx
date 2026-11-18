import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Navigation, MapPinOff, Siren } from "lucide-react";
import {
  NavigationError,
  detectPlatform,
  navigateToIncident,
  type Destination,
  type NavigationProvider,
} from "@/lib/navigation";
import {
  LocationPermissionError,
  REASON_TITLE,
  ensureLocationAvailable,
  permissionInstructions,
  type LocationBlockReason,
} from "@/lib/location-permission";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  incidentId: string;
  /** Fresh coordinates already in the client, used only for the disabled state. */
  hasCoords?: boolean;
  className?: string;
  compact?: boolean;
};

/**
 * Launches turn-by-turn navigation to the patient's latest position.
 * On mobile the responder picks Blue Light Maps (blue-light emergency routing,
 * primary) or Google Maps; on desktop only Google Maps has a web version.
 */
export function NavigateButton({ incidentId, hasCoords = true, className, compact }: Props) {
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState<{ reason: LocationBlockReason; message: string } | null>(null);
  const [choosing, setChoosing] = useState<Destination | null>(null);

  const launch = async (origin: Destination | null, provider: NavigationProvider) => {
    try {
      await navigateToIncident(incidentId, { origin, skipOriginLookup: true, provider });
    } catch (e) {
      toast.error(e instanceof NavigationError ? e.message : "Unable to retrieve patient location.");
    }
  };

  const go = async () => {
    setLoading(true);
    try {
      const coords = await ensureLocationAvailable();
      const origin = { latitude: coords.latitude, longitude: coords.longitude };
      if (detectPlatform() === "desktop") {
        await launch(origin, "google");
      } else {
        setChoosing(origin);
      }
    } catch (e) {
      if (e instanceof LocationPermissionError) {
        setBlocked({ reason: e.reason, message: e.message });
      } else {
        toast.error(e instanceof NavigationError ? e.message : "Unable to retrieve patient location.");
      }
    } finally {
      setLoading(false);
    }
  };

  const pick = async (provider: NavigationProvider) => {
    const origin = choosing;
    setChoosing(null);
    setLoading(true);
    await launch(origin, provider);
    setLoading(false);
  };

  const retry = async () => {
    setBlocked(null);
    await go();
  };

  const withoutOrigin = async () => {
    setBlocked(null);
    if (detectPlatform() === "desktop") {
      setLoading(true);
      await launch(null, "google");
      setLoading(false);
    } else {
      // Open the provider chooser without an origin (NaN sentinel).
      setChoosing({ latitude: Number.NaN, longitude: Number.NaN });
    }
  };

  const chooseWithoutOrigin = async (provider: NavigationProvider) => {
    setChoosing(null);
    setLoading(true);
    await launch(null, provider);
    setLoading(false);
  };

  const choosingHasOrigin = choosing !== null && Number.isFinite(choosing.latitude);

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={loading || !hasCoords}
        aria-label="Navigate to patient location"
        className={
          className ??
          `inline-flex ${compact ? "min-h-9" : "min-h-11"} items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent disabled:opacity-40`
        }
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {loading ? "Locating…" : "Navigate"}
      </button>

      <AlertDialog open={!!choosing} onOpenChange={(o) => !o && setChoosing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose navigation</AlertDialogTitle>
            <AlertDialogDescription>
              Blue Light Maps routes with emergency exemptions (bus lanes, restricted turns) where
              available. If it is not installed on this device, Google Maps opens instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => (choosingHasOrigin ? pick("bluelight") : chooseWithoutOrigin("bluelight"))}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emergency px-4 text-sm font-semibold text-emergency-foreground hover:bg-emergency/90"
            >
              <Siren className="h-4 w-4" aria-hidden="true" />
              Blue Light Maps — emergency routing
            </button>
            <button
              type="button"
              onClick={() => (choosingHasOrigin ? pick("google") : chooseWithoutOrigin("google"))}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
            >
              <Navigation className="h-4 w-4" aria-hidden="true" />
              Google Maps
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!blocked} onOpenChange={(o) => !o && setBlocked(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MapPinOff className="h-4 w-4 text-emergency" aria-hidden="true" />
              {blocked ? REASON_TITLE[blocked.reason] : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              BEACON SEDI needs your device location to route you from your position to the patient.
              {blocked?.message ? ` (${blocked.message})` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {blocked && (
            <ol className="list-decimal space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 pl-7 text-sm text-muted-foreground">
              {permissionInstructions(blocked.reason).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={withoutOrigin}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
            >
              Open map anyway
            </button>
            <AlertDialogAction onClick={retry}>Retry location</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
