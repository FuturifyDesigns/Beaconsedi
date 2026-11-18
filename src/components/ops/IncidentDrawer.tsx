import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, MapPin, MessageSquare, Send, Shield, Stethoscope, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  FRESHNESS_META, INCIDENT_STATUS, PRIORITY_META, PRIORITY_ORDER, agoPrecise, clock, distanceKm,
  estimateEta, locationFreshness, logAudit, logEvent, nearestHospital,
  type Hospital, type Incident, type Priority, type TriageReport, type Unit,
} from "@/lib/ops";
import { useIncidentAudit, useIncidentEvents, useIncidentMessages } from "@/hooks/useOpsData";
import { usePatientProfile } from "@/hooks/useResponder";
import { PatientPanel } from "@/components/command/PatientPanel";
import { TimelinePanel } from "@/components/ops/TimelinePanel";
import { NavigateButton } from "@/components/NavigateButton";
import { VoiceNotes } from "@/components/VoiceNotes";

type Props = {
  incident: Incident;
  unit: Unit | null;
  hospitals: Hospital[];
  onClose: () => void;
  onRefresh: () => void;
};

const TABS = [
  ["overview", "Overview", MapPin],
  ["triage", "Triage", Stethoscope],
  ["patient", "Patient", ClipboardList],
  ["comms", "Comms", MessageSquare],
  ["timeline", "Timeline", AlertTriangle],
  ["audit", "Audit", Shield],
] as const;
type Tab = (typeof TABS)[number][0];

export function IncidentDrawer({ incident, unit, hospitals, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const eventsQ = useIncidentEvents(incident.id, true);
  const messagesQ = useIncidentMessages(incident.id, true);
  const auditQ = useIncidentAudit(incident.id, tab === "audit");
  const patientQ = usePatientProfile(incident.patient_id);

  const p = PRIORITY_META[incident.priority] ?? PRIORITY_META.high;
  const s = INCIDENT_STATUS[incident.status] ?? INCIDENT_STATUS.active;
  const fresh = FRESHNESS_META[locationFreshness(incident)];
  const hospital = nearestHospital(incident, hospitals);

  return (
    <aside
      aria-label={`Incident ${incident.incident_code ?? incident.id.slice(0, 8)} detail`}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${p.chip}`}>{p.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.chip}`}>{s.label}</span>
            {incident.is_test && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning">TEST</span>}
          </div>
          <h2 className="mt-1 truncate text-sm font-bold">
            {incident.patient_name?.trim() || "Anonymous patient"}
            <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
              {incident.incident_code ?? incident.id.slice(0, 8)}
            </span>
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close incident detail" className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <nav role="tablist" aria-label="Incident detail sections" className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition ${
              tab === key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "overview" && (
          <div className="space-y-3">
            <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${fresh.chip}`}>
              {fresh.label} · {agoPrecise(incident.location_updated_at ?? incident.updated_at)}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-[11px]">
              <Row label="Coordinates" value={`${incident.latitude.toFixed(6)}, ${incident.longitude.toFixed(6)}`} mono />
              <Row label="GPS accuracy" value={incident.accuracy ? `±${Math.round(incident.accuracy)} m` : "unknown"} />
              <Row label="Speed" value={incident.speed != null ? `${Math.round(incident.speed * 3.6)} km/h` : "—"} />
              <Row label="Heading" value={incident.heading != null ? `${Math.round(incident.heading)}°` : "—"} />
              <Row label="Received" value={`${clock(incident.created_at)} · ${agoPrecise(incident.created_at)}`} />
              <Row label="Patients" value={String(incident.patient_count ?? 1)} />
              <Row label="Assigned unit" value={unit ? `${unit.call_sign} · ${unit.name}` : "Unassigned"} />
              <Row label="ETA" value={incident.eta_minutes != null ? `${incident.eta_minutes} min` : "—"} />
              <div className="col-span-2">
                <Row label="Address" value={incident.address ?? "Resolving…"} />
              </div>
              <div className="col-span-2">
                <Row label="Patient message" value={incident.message ?? "No message provided"} />
              </div>
              <div className="col-span-2">
                <Row
                  label="Nearest receiving hospital"
                  value={hospital ? `${hospital.hospital.name} · ${hospital.km.toFixed(1)} km · ETA ${estimateEta(hospital.km)} min` : "No hospital data"}
                />
              </div>
              {unit?.latitude != null && unit?.longitude != null && (
                <div className="col-span-2">
                  <Row
                    label="Unit distance to scene"
                    value={`${distanceKm({ lat: incident.latitude, lng: incident.longitude }, { lat: unit.latitude, lng: unit.longitude }).toFixed(1)} km`}
                  />
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              <NavigateButton incidentId={incident.id} />
              {incident.patient_phone && (
                <a
                  href={`tel:${incident.patient_phone}`}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-accent"
                >
                  Call patient
                </a>
              )}
            </div>
            <PriorityOverride incident={incident} onDone={onRefresh} />
          </div>
        )}

        {tab === "triage" && <TriageForm incident={incident} onDone={onRefresh} />}

        {tab === "patient" && (
          <PatientPanel incident={incident} patient={patientQ.data ?? null} loading={patientQ.isLoading} canView />
        )}

        {tab === "comms" && <Comms incident={incident} messages={messagesQ.data ?? []} loading={messagesQ.isLoading} onSent={() => messagesQ.refetch()} />}

        {tab === "timeline" && (
          <TimelinePanel events={eventsQ.data ?? []} loading={eventsQ.isLoading} incidentCode={incident.incident_code ?? incident.id.slice(0, 8)} />
        )}

        {tab === "audit" && (
          <ol className="space-y-2" aria-label="Audit trail">
            {auditQ.isLoading && <li className="h-10 animate-pulse rounded-lg bg-muted" />}
            {!auditQ.isLoading && (auditQ.data ?? []).length === 0 && (
              <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No audit entries yet.</li>
            )}
            {(auditQ.data ?? []).map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-2">
                <p className="text-xs font-semibold">{a.action.replace(/_/g, " ")}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">{clock(a.created_at)} · actor {a.actor_id?.slice(0, 8) ?? "system"}</p>
                {a.metadata != null && (
                  <pre className="mt-1 overflow-x-auto rounded bg-background p-1.5 text-[10px] text-muted-foreground">
                    {JSON.stringify(a.metadata)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${mono ? "font-mono" : ""} break-words`}>{value}</dd>
    </div>
  );
}

/* ------------------------------ priority override ------------------------- */

function PriorityOverride({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const [priority, setPriority] = useState<Priority>(incident.priority as Priority);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = priority !== incident.priority;

  async function save() {
    if (!reason.trim()) {
      toast.error("A reason is required to change incident priority");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("alerts")
        .update({ priority, priority_reason: reason.trim() } as never)
        .eq("id", incident.id);
      if (error) throw error;
      await logEvent(incident.id, "priority_changed", `${incident.priority} → ${priority}: ${reason.trim()}`);
      await logAudit("priority_override", "alert", incident.id, { from: incident.priority, to: priority, reason: reason.trim() });
      toast.success("Priority updated");
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change priority");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Priority override" className="rounded-lg border border-border p-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Priority override</h3>
      <div className="mt-2 flex flex-wrap gap-1">
        {PRIORITY_ORDER.map((pr) => (
          <button
            key={pr}
            type="button"
            aria-pressed={priority === pr}
            onClick={() => setPriority(pr)}
            className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition ${
              priority === pr ? (PRIORITY_META[pr]?.chip ?? "") + " ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {PRIORITY_META[pr]?.label ?? pr}
          </button>
        ))}
      </div>
      {changed && (
        <>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Reason for priority change (required)"
            aria-label="Reason for priority change"
            className="mt-2 min-h-9 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="mt-2 min-h-9 rounded-lg bg-emergency px-3 text-xs font-bold text-emergency-foreground disabled:opacity-40"
          >
            {busy ? "Saving…" : "Apply priority"}
          </button>
        </>
      )}
      {incident.priority_reason && <p className="mt-2 text-[10px] text-muted-foreground">Last change: {incident.priority_reason}</p>}
    </section>
  );
}

/* ---------------------------------- triage -------------------------------- */

const TRIAGE_FIELDS: { key: keyof TriageReport; label: string; options: string[] }[] = [
  { key: "trauma_type", label: "Trauma type", options: ["road traffic", "fall", "burn", "penetrating", "assault", "medical", "obstetric", "other"] },
  { key: "mechanism", label: "Mechanism", options: ["blunt", "penetrating", "thermal", "crush", "unknown"] },
  { key: "consciousness", label: "Consciousness", options: ["alert", "responds to voice", "responds to pain", "unresponsive"] },
  { key: "breathing", label: "Breathing", options: ["normal", "laboured", "absent", "unknown"] },
  { key: "bleeding", label: "Bleeding", options: ["none", "controlled", "severe", "unknown"] },
  { key: "spinal", label: "Spinal risk", options: ["no", "suspected", "unknown"] },
];

function TriageForm({ incident, onDone }: { incident: Incident; onDone: () => void }) {
  const [form, setForm] = useState<TriageReport>(incident.triage ?? {});
  const [count, setCount] = useState(incident.patient_count ?? 1);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const report: TriageReport = { ...form, patient_count: count, recorded_at: new Date().toISOString(), recorded_by: u.user?.email ?? null };
      const { error } = await supabase
        .from("alerts")
        .update({ triage: report, patient_count: count } as never)
        .eq("id", incident.id);
      if (error) throw error;
      await logEvent(incident.id, "triage_recorded", [form.trauma_type, form.consciousness, form.bleeding].filter(Boolean).join(" · ") || undefined);
      await logAudit("triage_recorded", "alert", incident.id, report as unknown as Record<string, unknown>);
      toast.success("Triage assessment saved");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save triage");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {TRIAGE_FIELDS.map((f) => (
        <fieldset key={String(f.key)}>
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {f.options.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={form[f.key] === o}
                onClick={() => setForm((prev) => ({ ...prev, [f.key]: prev[f.key] === o ? undefined : o }))}
                className={`min-h-9 rounded-lg border px-2.5 text-xs capitalize transition ${
                  form[f.key] === o ? "border-emergency bg-emergency/10 font-semibold text-emergency" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Patients involved
        <input
          type="number"
          min={1}
          max={999}
          value={count}
          onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
          className="mt-1 min-h-9 w-24 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
        />
      </label>

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Scene hazards
        <textarea
          rows={2}
          maxLength={400}
          value={form.hazards ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, hazards: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs font-normal normal-case text-foreground"
        />
      </label>

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Resources required
        <textarea
          rows={2}
          maxLength={400}
          value={form.resources ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, resources: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-xs font-normal normal-case text-foreground"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="min-h-10 w-full rounded-lg bg-emergency text-xs font-bold text-emergency-foreground disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save triage assessment"}
      </button>
      {form.recorded_at && (
        <p className="text-[10px] text-muted-foreground">
          Last recorded {clock(form.recorded_at)} by {form.recorded_by ?? "unknown"}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------- comms --------------------------------- */

function Comms({
  incident, messages, loading, onSent,
}: {
  incident: Incident;
  messages: { id: string; body: string; sender_label: string | null; sender_role: string; recipient_role: string; urgent: boolean; created_at: string }[];
  loading: boolean;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [to, setTo] = useState<"responder" | "patient">("responder");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("incident_messages").insert({
        alert_id: incident.id,
        sender_id: u.user.id,
        sender_label: u.user.email ?? "Dispatcher",
        sender_role: "dispatcher",
        recipient_role: to,
        body: text,
        urgent,
      } as never);
      if (error) throw error;
      await logEvent(incident.id, "message_sent", `To ${to}: ${text.slice(0, 120)}`);
      setBody("");
      setUrgent(false);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Message failed to send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <ol className="flex-1 space-y-2" aria-label="Incident messages">
        {loading && <li className="h-10 animate-pulse rounded-lg bg-muted" />}
        {!loading && messages.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No messages yet on this incident.
          </li>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg border p-2 ${m.urgent ? "border-emergency/50 bg-emergency/5" : "border-border"}`}
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {m.sender_label ?? m.sender_role} → {m.recipient_role} · {clock(m.created_at)}
              {m.urgent && <span className="ml-1 font-bold text-emergency">URGENT</span>}
            </p>
            <p className="text-xs">{m.body}</p>
          </li>
        ))}
      </ol>

      <VoiceNotes
        alertId={incident.id}
        senderRole="dispatcher"
        recipientRole={to}
        title={`Voice notes · ${incident.incident_code ?? incident.id.slice(0, 8)}`}
      />

      <div className="space-y-2 border-t border-border pt-2">
        <div className="flex gap-1">
          {(["responder", "patient"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={to === r}
              onClick={() => setTo(r)}
              className={`min-h-9 rounded-lg px-2.5 text-xs font-medium capitalize ${
                to === r ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              To {r}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={urgent}
            onClick={() => setUrgent((v) => !v)}
            className={`ml-auto min-h-9 rounded-lg px-2.5 text-xs font-semibold ${
              urgent ? "bg-emergency/15 text-emergency ring-1 ring-emergency/40" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Urgent
          </button>
        </div>
        <div className="flex gap-2">
          <textarea
            rows={2}
            maxLength={800}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message the assigned responder or the patient…"
            aria-label="Message body"
            className="flex-1 rounded-lg border border-border bg-background p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !body.trim()}
            aria-label="Send message"
            className="inline-flex min-h-10 items-center gap-1 self-end rounded-lg bg-emergency px-3 text-xs font-bold text-emergency-foreground disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
