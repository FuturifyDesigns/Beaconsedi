import { BLOOD_TYPES, PROFILE_LIMITS, PHONE_PATTERN, validateProfile } from "@/lib/validation";
import { SoundSettingsCard } from "@/components/SoundSettingsCard";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HeartPulse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useIsResponder } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [
    { title: "Medical profile — BEACON SEDI" },
    { name: "description", content: "Manage the medical details shared with emergency responders." },
    { property: "og:title", content: "Medical profile — BEACON SEDI" },
    { property: "og:description", content: "Manage the medical details shared with emergency responders." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProfilePage,
});

type Profile = {
  full_name: string; phone: string; blood_type: string; allergies: string;
  medical_conditions: string; medications: string;
  emergency_contact_name: string; emergency_contact_phone: string;
};

const EMPTY: Profile = {
  full_name: "", phone: "", blood_type: "", allergies: "",
  medical_conditions: "", medications: "", emergency_contact_name: "", emergency_contact_phone: "",
};

function ProfilePage() {
  const { isResponder } = useIsResponder();
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (error) { setLoadError("Could not load your profile. Reload before editing."); return; }
      if (data) setProfile({
        full_name: data.full_name ?? "", phone: data.phone ?? "",
        blood_type: data.blood_type ?? "", allergies: data.allergies ?? "",
        medical_conditions: data.medical_conditions ?? "", medications: data.medications ?? "",
        emergency_contact_name: data.emergency_contact_name ?? "",
        emergency_contact_phone: data.emergency_contact_phone ?? "",
      });
      setLoaded(true);
    })().catch(() => setLoadError("Could not load your profile. Reload before editing."));
  }, []);

  async function save() {
    if (!userId || !loaded || saving) return;
    try {
      const valid = validateProfile(profile);
      setSaving(true);
      const { error } = await supabase.from("profiles").upsert({ id: userId, ...valid });
      if (error) throw error;
      setProfile(valid);
      toast.success("Profile saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save profile"); }
    finally { setSaving(false); }
  }

  const field = (k: keyof Profile) => ({
    value: profile[k],
    maxLength: PROFILE_LIMITS[k],
    disabled: !loaded || saving,
    ...(k.includes("phone") ? { pattern: PHONE_PATTERN, title: "Enter 7–15 digits, with an optional country code" } : {}),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProfile((p) => ({ ...p, [k]: e.target.value })),
    className: "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2",
  });

  return (
    <AppShell isResponder={isResponder}>
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emergency/10 text-emergency">
            <HeartPulse className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Medical profile</h1>
            <p className="text-sm text-muted-foreground">Sent to responders with your alerts.</p>
          </div>
        </div>

        {loadError && <p role="alert" className="mt-3 text-sm text-destructive">{loadError}</p>}
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><input {...field("full_name")} /></Field>
            <Field label="Phone"><input {...field("phone")} type="tel" /></Field>
            <Field label="Blood type"><select value={profile.blood_type} disabled={!loaded || saving} onChange={(e) => setProfile((p) => ({ ...p, blood_type: e.target.value }))} className={field("blood_type").className}><option value="">Unknown / not recorded</option>{BLOOD_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <Field label="Allergies"><textarea {...field("allergies")} rows={2} /></Field>
          <Field label="Medical conditions"><textarea {...field("medical_conditions")} rows={2} /></Field>
          <Field label="Current medications"><textarea {...field("medications")} rows={2} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Emergency contact name"><input {...field("emergency_contact_name")} /></Field>
            <Field label="Emergency contact phone"><input {...field("emergency_contact_phone")} type="tel" /></Field>
          </div>

          <button
            type="submit" disabled={saving || !loaded}
            className="mt-2 w-full rounded-lg bg-emergency px-4 py-2.5 text-sm font-semibold text-emergency-foreground hover:opacity-90 disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>
        <div className="mt-4"><SoundSettingsCard showAlertTone={isResponder} /></div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
