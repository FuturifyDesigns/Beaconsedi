type Tone = "ok" | "warn" | "down";

function Dot({ tone }: { tone: Tone }) {
  const cls = tone === "ok" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-emergency";
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function Item({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2 py-1 text-[11px] font-medium">
      <Dot tone={tone} />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

export type SystemSignals = {
  live: "connected" | "connecting" | "offline";
  responderGps: boolean;
  patientGps: boolean;
  navigation: boolean;
  communications: boolean;
};

/** Per-component health strip driven by live emergency data. */
export function IntegrationStatusBar({ signals }: { signals: SystemSignals }) {
  return (
    <div role="status" aria-label="System status" className="mx-4 mt-3 flex flex-wrap gap-2">
      <Item label="BEACON SEDI" value="Online" tone="ok" />
      <Item
        label="Live link"
        value={signals.live === "connected" ? "Active" : signals.live === "connecting" ? "Reconnecting" : "Offline"}
        tone={signals.live === "connected" ? "ok" : signals.live === "connecting" ? "warn" : "down"}
      />
      <Item label="Responder GPS" value={signals.responderGps ? "Active" : "No fresh fix"} tone={signals.responderGps ? "ok" : "warn"} />
      <Item label="Patient GPS" value={signals.patientGps ? "Active" : "No fresh fix"} tone={signals.patientGps ? "ok" : "warn"} />
      <Item label="Navigation" value={signals.navigation ? "Active" : "Idle"} tone={signals.navigation ? "ok" : "warn"} />
      <Item label="Comms" value={signals.communications ? "Active" : "Idle"} tone={signals.communications ? "ok" : "warn"} />
    </div>
  );
}
