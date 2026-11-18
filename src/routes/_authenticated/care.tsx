import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, MapPin, Siren, Trash2, Check, X, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { GoogleMap, type MapMarker } from "@/components/GoogleMap";
import { watchSmoothed } from "@/lib/geolocation";
import { useTicker } from "@/hooks/useTracking";

export const Route = createFileRoute("/_authenticated/care")({
  head: () => ({
    meta: [
      { title: "Care circle — BEACON SEDI" },
      { name: "description", content: "Link with family and carers to share SOS alerts and live location on BEACON SEDI." },
      { property: "og:title", content: "Care circle — BEACON SEDI" },
      { property: "og:description", content: "Share SOS alerts and live location with the people who look after you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CarePage,
});

type Link = {
  id: string; patient_id: string; carer_id: string; relationship: string | null;
  status: string; created_by: string;
};
type Loc = { user_id: string; latitude: number; longitude: number; accuracy: number | null; updated_at: string; sharing: boolean };
type Alert = { id: string; patient_id: string | null; status: string; created_at: string; latitude: number; longitude: number; incident_code: string | null };

const OPEN = ["active", "acknowledged", "dispatched", "on_scene", "transporting"];

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function CarePage() {
  useTicker(5000);
  const [me, setMe] = useState<string | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [locs, setLocs] = useState<Record<string, Loc>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [asPatient, setAsPatient] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setMe(u.user.id);
    const { data, error } = await supabase.from("care_links").select("*").order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as Link[];
    setLinks(rows);
    const others = [...new Set(rows.map((l) => (l.patient_id === u.user!.id ? l.carer_id : l.patient_id)))];
    const patients = rows.filter((l) => l.carer_id === u.user!.id && l.status === "accepted").map((l) => l.patient_id);
    if (others.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", others);
      setNames(Object.fromEntries((p ?? []).map((r) => [r.id, r.full_name ?? ""])));
    }
    if (patients.length) {
      const [{ data: l }, { data: a }] = await Promise.all([
        supabase.from("live_locations").select("*").in("user_id", patients),
        supabase.from("alerts").select("id, patient_id, status, created_at, latitude, longitude, incident_code")
          .in("patient_id", patients).in("status", OPEN).order("created_at", { ascending: false }),
      ]);
      setLocs(Object.fromEntries(((l ?? []) as Loc[]).map((r) => [r.user_id, r])));
      setAlerts((a ?? []) as Alert[]);
    } else { setLocs({}); setAlerts([]); }
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase.channel("care-circle")
      .on("postgres_changes", { event: "*", schema: "public", table: "care_links" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_care_link", { _email: email.trim(), _as_patient: asPatient, _relationship: relationship });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Invitation sent — waiting for them to accept"); setEmail(""); setRelationship(""); void load(); }
  }

  async function respond(id: string, status: "accepted" | "declined") {
    const { error } = await supabase.from("care_links").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else void load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("care_links").delete().eq("id", id);
    if (error) toast.error(error.message); else void load();
  }

  const lookingAfter = links.filter((l) => me && l.carer_id === me && l.status === "accepted");
  const markers: MapMarker[] = useMemo(() => {
    const m: MapMarker[] = [];
    for (const l of lookingAfter) {
      const loc = locs[l.patient_id];
      if (loc) m.push({ id: `loc-${l.patient_id}`, lat: loc.latitude, lng: loc.longitude, title: names[l.patient_id] || "Linked person", color: "#2563eb", accuracyMeters: loc.accuracy ?? undefined });
    }
    for (const a of alerts) m.push({ id: `sos-${a.id}`, lat: a.latitude, lng: a.longitude, title: `SOS ${a.incident_code ?? ""}`, pulse: true, emphasis: true, noCluster: true });
    return m;
  }, [lookingAfter, locs, alerts, names]);

  const input = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-ring focus:ring-2";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <header className="flex items-center gap-3">
          <HeartHandshake className="h-6 w-6 text-emergency" />
          <div>
            <h1 className="text-2xl font-semibold">Care circle</h1>
            <p className="text-sm text-muted-foreground">People you link with see your SOS alerts and, if you choose, your live location.</p>
          </div>
        </header>

        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-emergency bg-emergency/10 p-4">
                <Siren className="h-5 w-5 animate-pulse text-emergency" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">{names[a.patient_id ?? ""] || "A linked person"} raised an SOS</p>
                  <p className="text-muted-foreground">{a.incident_code} · {a.status.replace(/_/g, " ")} · {ago(a.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <ShareLocation />

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">Add someone</h2>
          <form onSubmit={invite} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <label className="text-sm">Their BEACON SEDI email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            </label>
            <label className="text-sm">Relationship (optional)
              <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="e.g. daughter, nurse" className={input} />
            </label>
            <select value={asPatient ? "carer" : "patient"} onChange={(e) => setAsPatient(e.target.value === "carer")} className={input}>
              <option value="carer">They look after me</option>
              <option value="patient">I look after them</option>
            </select>
            <button disabled={busy} className="rounded-lg bg-emergency px-4 py-2 text-sm font-medium text-emergency-foreground disabled:opacity-50">
              {busy ? "Sending…" : "Invite"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">Links</h2>
          {links.length === 0 ? <p className="text-sm text-muted-foreground">No links yet.</p> : (
            <ul className="divide-y divide-border">
              {links.map((l) => {
                const iAmPatient = l.patient_id === me;
                const other = iAmPatient ? l.carer_id : l.patient_id;
                const loc = !iAmPatient ? locs[other] : undefined;
                const incoming = l.status === "pending" && l.created_by !== me;
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{names[other] || "BEACON SEDI user"}{l.relationship ? ` · ${l.relationship}` : ""}</p>
                      <p className="text-muted-foreground">
                        {iAmPatient ? "Looks after you" : "You look after them"} · {l.status}
                        {loc && ` · location ${ago(loc.updated_at)}${loc.accuracy ? ` (±${Math.round(loc.accuracy)} m)` : ""}`}
                      </p>
                    </div>
                    {incoming && (
                      <>
                        <button onClick={() => respond(l.id, "accepted")} className="inline-flex items-center gap-1 rounded-md bg-success px-3 py-1.5 text-success-foreground"><Check className="h-4 w-4" />Accept</button>
                        <button onClick={() => respond(l.id, "declined")} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5"><X className="h-4 w-4" />Decline</button>
                      </>
                    )}
                    <button onClick={() => remove(l.id)} aria-label="Remove link" className="rounded-md p-2 text-muted-foreground hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {lookingAfter.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <h2 className="flex items-center gap-2 p-4 font-semibold"><MapPin className="h-4 w-4" />Live map</h2>
            {markers.length ? <GoogleMap markers={markers} fitToMarkers className="h-80 w-full" /> :
              <p className="px-4 pb-4 text-sm text-muted-foreground">No one you look after is sharing their location right now.</p>}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function ShareLocation() {
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!on) return;
    setStatus("Waiting for GPS…");
    const stop = watchSmoothed(
      (c) => {
        const now = Date.now();
        if (now - lastSent.current < 10_000) return;
        lastSent.current = now;
        supabase.rpc("upsert_live_location", {
          _lat: c.latitude, _lng: c.longitude, _accuracy: c.accuracy,
          _heading: c.heading ?? undefined, _speed: c.speed ?? undefined, _sharing: true,
        }).then(({ error }) => setStatus(error ? `Upload failed: ${error.message}` : `Shared ±${Math.round(c.accuracy)} m at ${new Date().toLocaleTimeString()}`));
      },
      (e) => setStatus(`Location unavailable: ${e.message}`),
    );
    return () => {
      stop();
      lastSent.current = 0;
      void supabase.rpc("upsert_live_location", { _lat: 0, _lng: 0, _sharing: false });
    };
  }, [on]);

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <Radio className={`h-5 w-5 ${on ? "text-success" : "text-muted-foreground"}`} />
      <div className="flex-1 text-sm">
        <p className="font-medium">Share my live location with my carers</p>
        <p className="text-muted-foreground">{on ? status : "Off — carers only see where you are when you raise an SOS."}</p>
      </div>
      <button onClick={() => setOn((v) => !v)} className={`rounded-lg px-4 py-2 text-sm font-medium ${on ? "border border-border" : "bg-emergency text-emergency-foreground"}`}>
        {on ? "Stop sharing" : "Start sharing"}
      </button>
    </section>
  );
}
