import { ageFrom, type PatientProfile } from "@/lib/responder";
import type { Incident } from "@/lib/ops";
import { HeartPulse, Lock, Phone } from "lucide-react";

type Props = { incident: Incident | null; patient: PatientProfile | null; loading: boolean; canView: boolean };

export function PatientPanel({ incident, patient, loading, canView }: Props) {
  if (!incident) return <p className="p-4 text-xs text-muted-foreground">Select an incident to view patient information.</p>;

  if (!canView) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
        <Lock className="h-4 w-4" aria-hidden="true" /> Medical details unlock once you acknowledge or are assigned to this incident.
      </p>
    );
  }

  const age = ageFrom(patient?.date_of_birth ?? null);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">{patient?.full_name ?? incident.patient_name ?? "Anonymous patient"}</h3>
          <p className="text-[11px] text-muted-foreground">
            {[age != null ? `${age} yrs` : null, patient?.gender, patient?.phone ?? incident.patient_phone].filter(Boolean).join(" · ") || "No demographics on file"}
          </p>
        </div>
        {(patient?.phone || incident.patient_phone) && (
          <a
            href={`tel:${patient?.phone ?? incident.patient_phone}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emergency px-3 text-xs font-semibold text-emergency-foreground"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
          </a>
        )}
      </div>

      {loading && <div className="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-busy="true" />}

      {!loading && !patient && (
        <p className="text-xs text-muted-foreground">No registered medical record — treat as unknown history.</p>
      )}

      {patient && (
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <p className="mb-2 inline-flex items-center gap-1.5 font-semibold text-emergency">
            <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" /> Medical record
          </p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            <Row label="Blood type" value={patient.blood_type} />
            <Row label="Allergies" value={patient.allergies} />
            <Row label="Conditions" value={patient.medical_conditions} />
            <Row label="Medications" value={patient.medications} />
            <Row label="Special needs" value={patient.special_needs} />
            <Row label="Notes" value={patient.medical_notes} />
            <Row
              label="Emergency contact"
              value={patient.emergency_contact_name ? `${patient.emergency_contact_name} · ${patient.emergency_contact_phone ?? ""}` : null}
            />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
