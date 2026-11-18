import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createReferral, listReferralData } from "@/lib/referrals.functions";
import type { ReferralFacility, ReferralPriority } from "@/lib/referrals";

export const Route = createFileRoute("/_authenticated/referrals/new")({
  head: () => ({
    meta: [
      { title: "New ambulance referral — BEACON SEDI" },
      { name: "description", content: "Initiate an inter-facility ambulance transfer." },
      { property: "og:title", content: "New ambulance referral — BEACON SEDI" },
      { property: "og:description", content: "Initiate an inter-facility ambulance transfer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewReferralPage,
});

const AMBULANCE_TYPES = ["BLS — Basic life support", "ALS — Advanced life support", "ICU — Intensive care", "Neonatal", "Air ambulance"];

function NewReferralPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listReferralData);
  const createFn = useServerFn(createReferral);
  const facilities = useQuery({ queryKey: ["referral-command"], queryFn: () => listFn() });

  const [form, setForm] = useState({
    fromFacilityId: "",
    toFacilityId: "",
    patientRef: "",
    priority: "routine" as ReferralPriority,
    patientCondition: "",
    clinicalNotes: "",
    ambulanceType: AMBULANCE_TYPES[0],
    referringDoctor: "",
    contactPerson: "",
    contactPhone: "",
    provider: "",
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: (res) => navigate({ to: "/referrals/$id", params: { id: res.id } }),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const facilityList = (facilities.data?.facilities ?? []) as ReferralFacility[];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl p-4 md:p-6">
        <Link to="/referrals" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Command centre
        </Link>
        <header className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-emergency/10 text-emergency">
            <ClipboardPlus className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Initiate ambulance referral</h1>
            <p className="text-sm text-muted-foreground">
              The receiving facility and ambulance operator are notified immediately.
            </p>
          </div>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Referring facility" required>
              <select value={form.fromFacilityId} onChange={set("fromFacilityId")} required className={inputCls}>
                <option value="">Choose facility…</option>
                {facilityList.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Receiving facility" required>
              <select value={form.toFacilityId} onChange={set("toFacilityId")} required className={inputCls}>
                <option value="">Choose facility…</option>
                {facilityList
                  .filter((f) => f.id !== form.fromFacilityId)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.diversion_status === "diverting" ? " (on diversion)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Patient reference number" required>
              <input value={form.patientRef} onChange={set("patientRef")} required placeholder="e.g. PT-2026-1042" className={inputCls} />
            </Field>
            <Field label="Referral priority" required>
              <select value={form.priority} onChange={set("priority")} className={inputCls}>
                <option value="critical">Critical</option>
                <option value="emergency">Emergency</option>
                <option value="urgent">Urgent</option>
                <option value="routine">Routine</option>
              </select>
            </Field>
          </div>

          <Field label="Patient condition">
            <input value={form.patientCondition} onChange={set("patientCondition")} placeholder="e.g. Head injury, stable, ventilated" className={inputCls} />
          </Field>

          <Field label="Clinical referral notes">
            <textarea value={form.clinicalNotes} onChange={set("clinicalNotes")} rows={3} placeholder="Handover notes for the receiving team…" className={inputCls} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Required ambulance type">
              <select value={form.ambulanceType} onChange={set("ambulanceType")} className={inputCls}>
                {AMBULANCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Ambulance provider / EMS company">
              <input value={form.provider} onChange={set("provider")} placeholder="e.g. Botswana EMS" className={inputCls} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Referring doctor / practitioner">
              <input value={form.referringDoctor} onChange={set("referringDoctor")} placeholder="Dr …" className={inputCls} />
            </Field>
            <Field label="Contact person">
              <input value={form.contactPerson} onChange={set("contactPerson")} placeholder="Name" className={inputCls} />
            </Field>
          </div>

          <Field label="Contact phone">
            <input value={form.contactPhone} onChange={set("contactPhone")} type="tel" placeholder="+267 …" className={inputCls} />
          </Field>

          {create.error && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}

          <button
            type="submit"
            disabled={create.isPending}
            className="w-full rounded-lg bg-emergency px-4 py-3 text-sm font-semibold text-emergency-foreground hover:bg-emergency/90 disabled:opacity-50"
          >
            {create.isPending ? "Submitting…" : "Submit referral"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-emergency">*</span>}
      </span>
      {children}
    </label>
  );
}
