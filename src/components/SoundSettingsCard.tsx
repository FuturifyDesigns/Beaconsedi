import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getSoundSettings, saveSoundSettings, playPing, type SoundSettings } from "@/lib/sound-settings";
import { playAlertTone } from "@/lib/responder";

/** Alert volume + mute controls, available to patients, responders and crews. */
export function SoundSettingsCard({ showAlertTone }: { showAlertTone?: boolean }) {
  const [s, setS] = useState<SoundSettings>({ volume: 80, muted: false });
  useEffect(() => setS(getSoundSettings()), []);

  const update = (next: SoundSettings) => {
    setS(next);
    saveSoundSettings(next);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="sound-settings-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="sound-settings-title" className="text-base font-semibold">Alert sounds</h2>
          <p className="text-xs text-muted-foreground">Applies to this device. You get a chime each time a responder updates your SOS.</p>
        </div>
        <button
          type="button"
          onClick={() => update({ ...s, muted: !s.muted })}
          aria-pressed={s.muted}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${s.muted ? "bg-emergency text-emergency-foreground" : "border border-border hover:bg-accent"}`}
        >
          {s.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {s.muted ? "Muted" : "Sound on"}
        </button>
      </div>
      <label className="mt-4 block text-xs font-medium text-muted-foreground">
        Volume: {s.volume}%
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={s.volume}
          disabled={s.muted}
          onChange={(e) => update({ ...s, volume: Number(e.target.value) })}
          className="mt-2 w-full accent-[var(--emergency)] disabled:opacity-40"
          aria-label="Alert volume"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => playPing({ volume: s.muted ? 0 : s.volume })} className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent">
          Test update chime
        </button>
        {showAlertTone && (
          <button type="button" onClick={() => playAlertTone()} className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent">
            Test incoming SOS alarm
          </button>
        )}
      </div>
    </section>
  );
}
