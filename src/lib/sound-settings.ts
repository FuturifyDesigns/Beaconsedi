/** Per-device alert sound preferences (volume + mute), shared by patients, responders and crews. */
const KEY = "beacon-sound-settings";
export type SoundSettings = { volume: number; muted: boolean };
const DEFAULTS: SoundSettings = { volume: 80, muted: false };

export function getSoundSettings(): SoundSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      volume: typeof raw.volume === "number" ? Math.min(100, Math.max(0, raw.volume)) : DEFAULTS.volume,
      muted: !!raw.muted,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSoundSettings(s: SoundSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("beacon-sound-settings"));
}

/** Gain multiplier 0..1, or 0 when muted. */
export function soundGain(): number {
  const s = getSoundSettings();
  return s.muted ? 0 : s.volume / 100;
}

/** Bright two-note "pin" chime used for patient status updates (responder acknowledged, en route, arrived). */
export function playPing(force?: { volume: number }) {
  if (typeof window === "undefined") return;
  const g = force ? force.volume / 100 : soundGain();
  if (g <= 0) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume?.();
    const t0 = ctx.currentTime;
    [1318, 1760].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = t0 + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.35 * g), t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* audio unavailable */
  }
}
