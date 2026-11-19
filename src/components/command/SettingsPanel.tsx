import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, Volume2, Contrast, MoveDiagonal, Timer } from "lucide-react";

export type CommandPrefs = {
  sound: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  idleMinutes: number;
};

export const DEFAULT_PREFS: CommandPrefs = { sound: true, highContrast: false, reducedMotion: false, idleMinutes: 20 };

type Factor = { id: string; status: string; friendly_name?: string };

export function SettingsPanel({ prefs, onPrefs }: { prefs: CommandPrefs; onPrefs: (p: CommandPrefs) => void }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string } | null>(null);
  const [code, setCode] = useState("");

  async function refreshFactors() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }
  useEffect(() => { void refreshFactors(); }, []);

  async function startEnroll() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `BEACON SEDI ${Date.now()}` });
    if (error) return toast.error(error.message);
    setEnrolling({ id: data.id, qr: data.totp.qr_code });
  }

  async function verifyEnroll() {
    if (!enrolling) return;
    if (!/^[0-9]{6}$/.test(code)) return toast.error("Enter the six-digit authentication code");
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.id });
    if (cErr) return toast.error(cErr.message);
    const { error } = await supabase.auth.mfa.verify({ factorId: enrolling.id, challengeId: challenge.id, code });
    if (error) return toast.error(error.message);
    toast.success("Multi-factor authentication enabled");
    setEnrolling(null);
    setCode("");
    void refreshFactors();
  }

  async function unenroll(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return toast.error(error.message);
    toast.success("Authenticator removed");
    void refreshFactors();
  }

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accessibility & alerts</h3>
        <div className="space-y-2">
          <Toggle icon={Volume2} label="Audible alert tone for high-priority SOS" checked={prefs.sound} onChange={(v) => onPrefs({ ...prefs, sound: v })} />
          <Toggle icon={Contrast} label="High contrast mode" checked={prefs.highContrast} onChange={(v) => onPrefs({ ...prefs, highContrast: v })} />
          <Toggle icon={MoveDiagonal} label="Reduced motion" checked={prefs.reducedMotion} onChange={(v) => onPrefs({ ...prefs, reducedMotion: v })} />
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
            <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="idle-minutes" className="text-xs">Automatic logout after inactivity</label>
            <select
              id="idle-minutes"
              value={prefs.idleMinutes}
              onChange={(e) => onPrefs({ ...prefs, idleMinutes: Number(e.target.value) })}
              className="ml-auto min-h-11 rounded-lg border border-border bg-card px-2 text-xs"
            >
              {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Multi-factor authentication
        </h3>
        {verified.length ? (
          <ul className="space-y-2">
            {verified.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-xs text-success">
                Authenticator app enrolled
                <button type="button" onClick={() => unenroll(f.id)} className="ml-auto min-h-11 rounded-lg px-2 text-muted-foreground hover:text-foreground">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : enrolling ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Scan this code with your authenticator app, then enter the 6-digit code.</p>
            <img src={enrolling.qr} alt="MFA enrolment QR code" className="h-40 w-40 rounded-lg bg-white p-2" />
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="mfa-code">Authentication code</label>
              <input maxLength={6}
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                id="mfa-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="min-h-11 w-32 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <button type="button" onClick={verifyEnroll} className="min-h-11 rounded-lg bg-emergency px-3 text-xs font-semibold text-emergency-foreground">
                Verify
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Add an authenticator app so emergency data stays protected if your password leaks.</p>
            <button type="button" onClick={startEnroll} className="min-h-11 rounded-lg bg-emergency px-3 text-xs font-semibold text-emergency-foreground">
              Enable MFA
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Toggle({
  icon: Icon, label, checked, onChange,
}: { icon: React.ComponentType<{ className?: string }>; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background p-3 text-xs">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="ml-auto h-5 w-5 accent-[var(--emergency)]" />
    </label>
  );
}
