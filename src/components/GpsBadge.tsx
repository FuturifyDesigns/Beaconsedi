import { GPS_QUALITY_META, type GpsQuality } from "@/lib/geolocation";
import { Satellite, WifiOff } from "lucide-react";

type Props = { quality: GpsQuality; accuracy?: number | null; online?: boolean; className?: string };

export function GpsBadge({ quality, accuracy, online = true, className }: Props) {
  const meta = GPS_QUALITY_META[quality];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs ${className ?? ""}`}
    >
      {online ? (
        <Satellite className={`h-3.5 w-3.5 ${meta.className}`} aria-hidden="true" />
      ) : (
        <WifiOff className="h-3.5 w-3.5 text-emergency" aria-hidden="true" />
      )}
      <span className={meta.className}>{online ? meta.label : "Offline — reconnecting"}</span>
      {accuracy != null && Number.isFinite(accuracy) && (
        <span className="text-muted-foreground">±{Math.round(accuracy)} m</span>
      )}
    </div>
  );
}
