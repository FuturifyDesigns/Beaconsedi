import { PHONE_PATTERN } from "@/lib/validation";
import { useEffect, useState } from "react";
import { CERT_LEVELS, licenseExpiryState, type ResponderProfile } from "@/lib/responder";
import { AlertTriangle, Save } from "lucide-react";

type Draft = Partial<ResponderProfile>;
type Props = { profile: ResponderProfile | null; saving: boolean; onSave: (draft: Draft) => void };

const FIELDS: { key: keyof ResponderProfile; label: string; type?: string; group: string }[] = [
  { key: "full_name", label: "Full name", group: "Personal information" },
  { key: "national_id", label: "National identity number", group: "Personal information" },
  { key: "employee_number", label: "Employee number", group: "Personal information" },
  { key: "responder_code", label: "Responder ID", group: "Personal information" },
  { key: "photo_url", label: "Photograph URL", type: "url", group: "Personal information" },
  { key: "gender", label: "Gender", group: "Personal information" },
  { key: "date_of_birth", label: "Date of birth", type: "date", group: "Personal information" },
  { key: "phone", label: "Phone number", type: "tel", group: "Personal information" },
  { key: "email", label: "Email address", type: "email", group: "Personal information" },
  { key: "home_station", label: "Home station", group: "Personal information" },
  { key: "license_number", label: "License number", group: "Professional details" },
  { key: "license_expiry", label: "License expiry", type: "date", group: "Professional details" },
  { key: "organization", label: "Organization", group: "Employment" },
  { key: "department", label: "Department", group: "Employment" },
  { key: "rank", label: "Rank", group: "Employment" },
  { key: "years_of_service", label: "Years of service", type: "number", group: "Employment" },
];

export function ProfilePanel({ profile, saving, onSave }: Props) {
  const [draft, setDraft] = useState<Draft>({});
  useEffect(() => setDraft(profile ?? {}), [profile]);

  const expiry = licenseExpiryState(draft.license_expiry ?? null);
  const groups = ["Personal information", "Professional details", "Employment"];

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      {expiry !== "valid" && (
        <p
          role="status"
          className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
            expiry === "expired" ? "border-emergency/40 bg-emergency/10 text-emergency" : "border-warning/40 bg-warning/10 text-warning"
          }`}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {expiry === "expired" ? "Your certification license has expired — verification required." :
           expiry === "expiring" ? "Your license expires within 60 days." : "No license expiry recorded."}
        </p>
      )}

      {groups.map((group) => (
        <fieldset key={group} className="rounded-xl border border-border bg-card p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.filter((f) => f.group === group).map((f) => (
              <div key={String(f.key)}>
                <label htmlFor={`rp-${String(f.key)}`} className="mb-1 block text-[11px] text-muted-foreground">{f.label}</label>
                <input
                  id={`rp-${String(f.key)}`}
                  type={f.type ?? "text"}
                  required={f.key === "full_name"}
                  min={f.type === "number" ? 0 : undefined}
                  max={f.type === "number" ? 80 : f.key === "date_of_birth" ? new Date().toISOString().slice(0, 10) : undefined}
                  step={f.type === "number" ? 1 : undefined}
                  maxLength={f.type === "tel" ? 25 : f.type === "url" ? 2048 : 400}
                  pattern={f.type === "tel" ? PHONE_PATTERN : undefined}
                  value={(draft[f.key] as string | number | null) ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.key]: f.type === "number" ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value }))
                  }
                  className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground"
                />
              </div>
            ))}
            {group === "Professional details" && (
              <div>
                <label htmlFor="rp-cert" className="mb-1 block text-[11px] text-muted-foreground">Certification level</label>
                <select
                  id="rp-cert"
                  value={draft.certification_level ?? "emt_basic"}
                  onChange={(e) => setDraft((d) => ({ ...d, certification_level: e.target.value }))}
                  className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {Object.entries(CERT_LEVELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </fieldset>
      ))}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emergency px-4 text-sm font-semibold text-emergency-foreground disabled:opacity-60"
      >
        <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
