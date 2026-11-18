import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Siren, MapPin, Clock, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useIsResponder } from "@/hooks/useRole";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — BEACON SEDI" },
    { name: "description", content: "Send an emergency alert and view your recent alerts." },
    { property: "og:title", content: "Dashboard — BEACON SEDI" },
    { property: "og:description", content: "Send an emergency alert and view your recent alerts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const { isResponder } = useIsResponder();
  const { data: alerts } = useQuery({
    queryKey: ["my-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("alerts")
        .select("id, status, latitude, longitude, message, created_at, responder_notes")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell isResponder={isResponder}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Your safety</h1>
            <p className="mt-1 text-sm text-muted-foreground">Send an alert or view your history.</p>
          </div>
        </div>

        <Link
          to="/sos"
          className="mt-6 flex items-center gap-4 rounded-2xl bg-emergency p-6 text-emergency-foreground shadow-[var(--shadow-emergency)] transition hover:opacity-95"
        >
          <div className="grid h-14 w-14 place-items-center rounded-full bg-emergency-foreground/15">
            <Siren className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold">Emergency SOS</p>
            <p className="text-sm opacity-90">One tap sends your location to responders</p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider">Go →</span>
        </Link>

        {isResponder && (
          <Link
            to="/responder"
            className="mt-4 flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:bg-accent"
          >
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emergency/10 text-emergency">
              <Radio className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Responder dashboard</p>
              <p className="text-xs text-muted-foreground">See incoming alerts on the map</p>
            </div>
          </Link>
        )}

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent alerts
          </h2>
          <div className="mt-3 space-y-2">
            {alerts && alerts.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                No alerts yet. Stay safe.
              </p>
            )}
            {alerts?.map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <div className={`mt-0.5 h-2 w-2 rounded-full ${
                  a.status === "resolved" ? "bg-success" : a.status === "dispatched" ? "bg-emergency" : "bg-warning"
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-medium capitalize">{a.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.message || "Emergency alert"}
                  </p>
                  {a.responder_notes && (
                    <p className="mt-1 text-xs italic text-muted-foreground">Responder: {a.responder_notes}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(a.created_at).toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
