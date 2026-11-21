import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AuditEntry, Hospital, Incident, IncidentEvent, IncidentMessage, Unit } from "@/lib/ops";
import { playAlertTone } from "@/lib/responder";
import { buzz } from "@/lib/haptics";
import { applyIncidentChange, applyUnitChange, mergeLiveRows, retainSubscription, updateLiveList } from "@/lib/live-query";
import { useLiveReconcile } from "@/hooks/useLiveReconcile";

export function useIncidents(enabled: boolean) {
  const interval = useLiveReconcile("ops", 5000);
  return useQuery({
    queryKey: ["ops", "incidents"],
    enabled,
    refetchInterval: interval,
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
  const interval = useLiveReconcile("ops", 10_000);
  return useQuery({
    queryKey: ["ops", "units"],
    enabled,
    refetchInterval: interval,
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
        applyIncidentChange(queryClient, payload);
        if (payload.eventType === "INSERT") {
          const row = payload.new as Partial<Incident>;
          playAlertTone();
          toast.error(`New ${String(row.priority ?? "high").toUpperCase()} incident`, {
            description: row.message || row.address || "Live location received",
          });
          buzz([200, 100, 200]);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "responder_units" }, payload => applyUnitChange(queryClient, payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "hospitals" }, () => invalidate("hospitals"))
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_events" }, () =>
        queryClient.invalidateQueries({ queryKey: ["ops", "events"] }),
      )
      .subscribe(status => queryClient.setQueryData(["live-status", "ops"], status === "SUBSCRIBED"));

    return () => {
      queryClient.setQueryData(["live-status", "ops"], false);
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

/** Messages attached to one incident (dispatcher ⇄ responder ⇄ patient). */
export function useIncidentMessages(alertId: string | null, enabled: boolean) {
  const client = useQueryClient();
  const interval = useLiveReconcile(`messages-${alertId}`, 5000);
  useEffect(() => {
    if (!enabled || !alertId) return;
    return retainSubscription(client, `messages-${alertId}`, () => {
      const channel = supabase.channel(`incident-messages-${alertId}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "incident_messages", filter: `alert_id=eq.${alertId}` }, change => {
          updateLiveList<IncidentMessage>(client, ["ops", "messages", alertId], rows => mergeLiveRows(rows, change, () => true, (a, b) => a.created_at.localeCompare(b.created_at), 200));
        })
        .subscribe(status => client.setQueryData(["live-status", `messages-${alertId}`], status === "SUBSCRIBED"));
      return () => { client.setQueryData(["live-status", `messages-${alertId}`], false); void supabase.removeChannel(channel); };
    });
  }, [alertId, enabled, client]);
  return useQuery({
    queryKey: ["ops", "messages", alertId],
    enabled: enabled && !!alertId,
    refetchInterval: interval,
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
