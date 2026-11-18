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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (data) setProfile({
        full_name: data.full_name ?? "", phone: data.phone ?? "",
        blood_type: data.blood_type ?? "", allergies: data.allergies ?? "",
        medical_conditions: data.medical_conditions ?? "", medications: data.medications ?? "",
        emergency_contact_name: data.emergency_contact_name ?? "",
        emergency_contact_phone: data.emergency_contact_phone ?? "",
      });
    })();
  }, []);

  async function save() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ id: userId, ...profile });
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile saved");
  }

  const field = (k: keyof Profile) => ({
    value: profile[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProfile((p) => ({ ...p, [k]: e.target.value })),
    className: "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2",
  });

  return (
    <AppShell isResponder={isResponder}>
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emergency/10 text-emergency">
            <HeartPulse className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">Medical profile</h1>
            <p className="text-sm text-muted-foreground">Sent to responders with your alerts.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name"><input {...field("full_name")} /></Field>
            <Field label="Phone"><input {...field("phone")} type="tel" /></Field>
            <Field label="Blood type"><input {...field("blood_type")} placeholder="e.g. O−" /></Field>
          </div>
          <Field label="Allergies"><textarea {...field("allergies")} rows={2} /></Field>
          <Field label="Medical conditions"><textarea {...field("medical_conditions")} rows={2} /></Field>
          <Field label="Current medications"><textarea {...field("medications")} rows={2} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Emergency contact name"><input {...field("emergency_contact_name")} /></Field>
            <Field label="Emergency contact phone"><input {...field("emergency_contact_phone")} type="tel" /></Field>
          </div>

          <button
            onClick={save} disabled={saving}
            className="mt-2 w-full rounded-lg bg-emergency px-4 py-2.5 text-sm font-semibold text-emergency-foreground hover:opacity-90 disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
        <div className="mt-6"><SoundSettingsCard showAlertTone={isResponder} /></div>
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
