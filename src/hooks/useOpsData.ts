import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AuditEntry, Hospital, Incident, IncidentEvent, IncidentMessage, Unit } from "@/lib/ops";
import { playAlertTone } from "@/lib/responder";
import { buzz } from "@/lib/haptics";

export function useIncidents(enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "incidents"],
    enabled,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("is_test", false)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Incident[];
    },
  });
}

export function useUnits(enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "units"],
    enabled,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responder_units")
        .select("*")
        .not("user_id", "is", null)
        .order("call_sign");
      if (error) throw error;
      return data as Unit[];
    },
  });
}

export function useHospitals(enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "hospitals"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("hospitals").select("*").order("name");
      if (error) throw error;
      return data as Hospital[];
    },
  });
}

export function useIncidentEvents(alertId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "events", alertId],
    enabled: enabled && !!alertId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_events")
        .select("*")
        .eq("alert_id", alertId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as IncidentEvent[];
    },
  });
}

/** One realtime channel for the whole operations console. */
export function useOpsRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: ["ops", key] });

    const channel = supabase
      .channel("ops-console")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, (payload) => {
        invalidate("incidents");
        if (payload.eventType === "INSERT") {
          const row = payload.new as Partial<Incident>;
          playAlertTone();
          toast.error(`New ${String(row.priority ?? "high").toUpperCase()} incident`, {
            description: row.message || row.address || "Live location received",
          });
          buzz([200, 100, 200]);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "responder_units" }, () => invalidate("units"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "responder_locations" }, () => invalidate("units"))
      .on("postgres_changes", { event: "*", schema: "public", table: "hospitals" }, () => invalidate("hospitals"))
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_events" }, () =>
        queryClient.invalidateQueries({ queryKey: ["ops", "events"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_messages" }, () =>
        queryClient.invalidateQueries({ queryKey: ["ops", "messages"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

/** Messages attached to one incident (dispatcher ⇄ responder ⇄ patient). */
export function useIncidentMessages(alertId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "messages", alertId],
    enabled: enabled && !!alertId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_messages")
        .select("*")
        .eq("alert_id", alertId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as unknown as IncidentMessage[];
    },
  });
}

/** Authorized audit history for one incident. */
export function useIncidentAudit(alertId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["ops", "audit", alertId],
    enabled: enabled && !!alertId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("target_id", alertId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as AuditEntry[];
    },
  });
}

export type LinkState = "connected" | "connecting" | "offline";

/** Combined browser-network + realtime-subscription connection state. */
export function useConnectionState(enabled: boolean): LinkState {
  const [online, setOnline] = useState(true);
  const [channelUp, setChannelUp] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      // Reconcile everything that may have changed while we were dark.
      queryClient.invalidateQueries({ queryKey: ["ops"] });
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase.channel("ops-link").subscribe((status) => {
      setChannelUp(status === "SUBSCRIBED");
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled]);

  if (!online) return "offline";
  return channelUp ? "connected" : "connecting";
}
