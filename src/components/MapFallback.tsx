import { useState } from "react";
import { Copy, MapPinOff, Navigation, RefreshCw, Check } from "lucide-react";

export type MapFallbackDetails = {
  lat?: number | null;
  lng?: number | null;
  accuracyMeters?: number | null;
  updatedAt?: string | null;
  address?: string | null;
  incidentId?: string | null;
};

type Props = MapFallbackDetails & {
  reason?: string | null;
  onRetry?: () => void;
};

const fmt = (n: number) => n.toFixed(6);

/**
 * Emergency-safe replacement for the map when Google Maps cannot load.
 * The incident data itself must stay fully actionable without the map.
 */
export function MapFallback({ lat, lng, accuracyMeters, updatedAt, address, incidentId, reason, onRetry }: Props) {
  const [copied, setCopied] = useState(false);
  const hasCoords = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
  const coordText = hasCoords ? `${fmt(lat!)}, ${fmt(lng!)}` : null;

  const copy = async () => {
    if (!coordText) return;
    try {
      await navigator.clipboard.writeText(coordText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const navUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${fmt(lat!)},${fmt(lng!)}&travelmode=driving`
    : null;

  return (
    <div role="alert" className="flex h-full min-h-[360px] w-full flex-col justify-center gap-3 overflow-auto rounded-xl border border-emergency/40 bg-card p-4">
      <div className="flex items-center gap-2 text-emergency">
        <MapPinOff className="h-5 w-5" aria-hidden="true" />
        <p className="text-sm font-bold uppercase tracking-wide">Map service unavailable</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {reason ?? "The map provider could not be reached."} Incident data below is still live.
      </p>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        {incidentId && (
          <div className="col-span-2 rounded-lg bg-muted p-2">
            <dt className="text-muted-foreground">Incident</dt>
            <dd className="font-mono font-semibold">{incidentId}</dd>
          </div>
        )}
        <div className="rounded-lg bg-muted p-2">
          <dt className="text-muted-foreground">Latitude</dt>
          <dd className="font-mono font-semibold">{hasCoords ? fmt(lat!) : "—"}</dd>
        </div>
        <div className="rounded-lg bg-muted p-2">
          <dt className="text-muted-foreground">Longitude</dt>
          <dd className="font-mono font-semibold">{hasCoords ? fmt(lng!) : "—"}</dd>
        </div>
        <div className="rounded-lg bg-muted p-2">
          <dt className="text-muted-foreground">Accuracy</dt>
          <dd className="font-semibold">{accuracyMeters != null ? `±${Math.round(accuracyMeters)} m` : "Unknown"}</dd>
        </div>
        <div className="rounded-lg bg-muted p-2">
          <dt className="text-muted-foreground">Last GPS update</dt>
          <dd className="font-semibold">{updatedAt ? new Date(updatedAt).toLocaleTimeString() : "Unknown"}</dd>
        </div>
        {address && (
          <div className="col-span-2 rounded-lg bg-muted p-2">
            <dt className="text-muted-foreground">Address</dt>
            <dd className="font-semibold">{address}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!coordText}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy coordinates"}
        </button>
        {navUrl && (
          <a
            href={navUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emergency px-3 text-xs font-semibold text-emergency-foreground"
          >
            <Navigation className="h-4 w-4" /> Open navigation
          </a>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium"
          >
            <RefreshCw className="h-4 w-4" /> Retry map
          </button>
        )}
      </div>
    </div>
  );
}
