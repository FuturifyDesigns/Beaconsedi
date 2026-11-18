import { Ambulance, Building2, Flame, Plane, Radio, Shield, Siren, Users } from "lucide-react";

export type QuickActionKey =
  | "dispatch_ambulance" | "dispatch_police" | "dispatch_fire" | "notify_hospital"
  | "broadcast" | "backup" | "air_ambulance" | "mass_casualty";

const ACTIONS: { key: QuickActionKey; label: string; icon: typeof Siren; hint: string; danger?: boolean }[] = [
  { key: "dispatch_ambulance", label: "Dispatch ambulance", icon: Ambulance, hint: "A" },
  { key: "dispatch_police", label: "Dispatch police", icon: Shield, hint: "P" },
  { key: "dispatch_fire", label: "Dispatch fire", icon: Flame, hint: "F" },
  { key: "notify_hospital", label: "Notify hospital", icon: Building2, hint: "H" },
  { key: "broadcast", label: "Broadcast alert", icon: Radio, hint: "B" },
  { key: "backup", label: "Request backup", icon: Users, hint: "R" },
  { key: "air_ambulance", label: "Air ambulance", icon: Plane, hint: "L" },
  { key: "mass_casualty", label: "Mass casualty mode", icon: Siren, hint: "M", danger: true },
];

type Props = { onAction: (key: QuickActionKey) => void; disabled: boolean };

export function QuickActions({ onAction, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      {ACTIONS.map(({ key, label, icon: Icon, hint, danger }) => (
        <button
          key={key}
          type="button"
          onClick={() => onAction(key)}
          disabled={disabled}
          title={`${label} (shortcut ${hint})`}
          className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition disabled:opacity-40 ${
            danger
              ? "border-emergency/60 bg-emergency/10 text-emergency hover:bg-emergency/20"
              : "border-border bg-card text-foreground hover:bg-accent"
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{label}</span>
          <kbd className="ml-auto hidden rounded border border-border px-1 text-[10px] font-normal text-muted-foreground sm:block">{hint}</kbd>
        </button>
      ))}
    </div>
  );
}
