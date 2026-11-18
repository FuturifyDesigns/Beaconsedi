import { VEHICLE_STATUS } from "@/lib/responder";
import { Fuel, Gauge, MapPin, ShieldCheck, Truck } from "lucide-react";

export type VehicleRecord = {
  id: string;
  name: string;
  call_sign: string;
  kind: string;
  status: string;
  vehicle: string | null;
  vehicle_number: string | null;
  registration_number: string | null;
  fuel_level: number;
  mileage_km: number;
  last_inspection: string | null;
  equipment_status: string;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function VehiclePanel({ vehicle, onStatus }: { vehicle: VehicleRecord | null; onStatus: (s: string) => void }) {
  if (!vehicle) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No emergency vehicle is assigned to you yet. Ask your dispatch admin to assign a unit.
      </p>
    );
  }
  const status = VEHICLE_STATUS[vehicle.status] ?? VEHICLE_STATUS.offline;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid aspect-video place-items-center bg-secondary">
          {vehicle.image_url ? (
            <img src={vehicle.image_url} alt={`${vehicle.name} emergency vehicle`} className="size-full object-cover" loading="lazy" />
          ) : (
            <Truck className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="p-4">
          <p className="text-sm font-bold">{vehicle.name}</p>
          <p className="text-xs text-muted-foreground">{vehicle.call_sign} · {vehicle.kind}</p>
          <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.chip}`}>
            <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" /> {status.label}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat icon={Truck} label="Vehicle number" value={vehicle.vehicle_number ?? vehicle.vehicle ?? "—"} />
          <Stat icon={ShieldCheck} label="Registration" value={vehicle.registration_number ?? "—"} />
          <Stat icon={Fuel} label="Fuel level" value={`${vehicle.fuel_level}%`} />
          <Stat icon={Gauge} label="Mileage" value={`${vehicle.mileage_km.toLocaleString()} km`} />
          <Stat icon={ShieldCheck} label="Last inspection" value={vehicle.last_inspection ? new Date(vehicle.last_inspection).toLocaleDateString() : "—"} />
          <Stat icon={ShieldCheck} label="Equipment" value={vehicle.equipment_status} />
          <Stat
            icon={MapPin}
            label="GPS location"
            value={vehicle.latitude != null && vehicle.longitude != null ? `${vehicle.latitude.toFixed(4)}, ${vehicle.longitude.toFixed(4)}` : "No fix"}
          />
        </dl>

        <div className="rounded-xl border border-border bg-card p-4">
          <label htmlFor="vehicle-status" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Update vehicle status
          </label>
          <select
            id="vehicle-status"
            value={vehicle.status}
            onChange={(e) => onStatus(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          >
            {Object.entries(VEHICLE_STATUS).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold">{value}</dd>
    </div>
  );
}
