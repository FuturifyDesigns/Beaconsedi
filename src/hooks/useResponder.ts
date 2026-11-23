import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buzz } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import type { Notification, PatientProfile, ResponderProfile, Shift, ShiftEvent } from "@/lib/responder";
import { playAlertTone } from "@/lib/responder";
import type { Unit } from "@/lib/ops";
import { applyIncidentChange, applyUnitChange, applyAssignedVehicleChange } from "@/lib/live-query";

export function useCurrentUser() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? "" });
    });
  }, []);
  return user;
}

export function useResponderProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["responder", "profile", userId],
    refetchInterval: 10_000,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("responder_profiles").select("*").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return (data as unknown as ResponderProfile) ?? null;
    },
  });
}

export function useTeam(enabled: boolean) {
  return useQuery({
    queryKey: ["responder", "team"],
    enabled,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("responder_profiles").select("*").order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as ResponderProfile[];
    },
  });
}

export function useActiveShift(userId: string | undefined) {
  return useQuery({
    queryKey: ["responder", "shift", userId],
    enabled: !!userId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("user_id", userId!)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Shift) ?? null;
    },
  });
}

export function useShiftHistory(userId: string | undefined) {
  return useQuery({
    queryKey: ["responder", "shift-history", userId],
    refetchInterval: 10_000,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("user_id", userId!)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as Shift[];
    },
  });
}

export function useShiftEvents(shiftId: string | undefined) {
  return useQuery({
    queryKey: ["responder", "shift-events", shiftId],
    refetchInterval: 10_000,
    enabled: !!shiftId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_events")
        .select("*")
        .eq("shift_id", shiftId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShiftEvent[];
    },
  });
}

export function useAssignedUnit(unitId: string | null | undefined) {
  return useQuery({
    queryKey: ["responder", "unit", unitId],
    enabled: !!unitId,
    refetchInterval: 45_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("responder_units").select("*").eq("id", unitId!).maybeSingle();
      if (error) throw error;
      return (data as unknown as Unit & {
        vehicle_number: string | null;
        registration_number: string | null;
        fuel_level: number;
        mileage_km: number;
        last_inspection: string | null;
        equipment_status: string;
        image_url: string | null;
      }) ?? null;
    },
  });
}

/** The vehicle owner is the authoritative assignment used by dispatch. */
export function useAssignedVehicle(userId: string | undefined) {
  return useQuery({
    queryKey: ["responder", "assigned-vehicle", userId],
    enabled: !!userId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("responder_units").select("*").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return data as (Unit & { registration_number: string | null; vehicle_number: string | null; fuel_level: number; mileage_km: number; last_inspection: string | null; equipment_status: string; image_url: string | null }) | null;
    },
  });
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ["responder", "notifications", userId],
    enabled: !!userId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Notification[];
    },
  });
}

export function usePatientProfile(patientId: string | null | undefined) {
  return useQuery({
    queryKey: ["responder", "patient", patientId],
    refetchInterval: 15_000,
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", patientId!).maybeSingle();
      if (error) throw error;
      return (data as unknown as PatientProfile) ?? null;
    },
  });
}

/** Live SOS + notification stream for the signed-in responder. */
export function useResponderRealtime(enabled: boolean, userId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("responder-command")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, (payload) => {
        applyIncidentChange(queryClient, payload);
        if (payload.eventType === "INSERT") {
          const row = payload.new as { priority?: string; message?: string; patient_name?: string | null };
          playAlertTone();
          buzz([300, 120, 300, 120, 500]);
          toast.error(`New SOS · ${(row.priority ?? "high").toUpperCase()}`, {
            description: `${row.patient_name ?? "Anonymous patient"} — ${row.message ?? "Location received"}`,
            duration: 12_000,
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "responder_units" }, payload => {
        applyUnitChange(queryClient, payload);
        applyAssignedVehicleChange(queryClient, userId, payload);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_events" }, () => {
        queryClient.invalidateQueries({ queryKey: ["ops", "events"] });
      })
      .subscribe(status => {
        queryClient.setQueryData(["live-status", "ops"], status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          void queryClient.invalidateQueries({ queryKey: ["responder"] });
          void queryClient.invalidateQueries({ queryKey: ["ops", "incidents"] });
        }
      });

    const staffChannel = supabase.channel(`staff-workflows-${userId ?? "staff"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["responder", "shift"] });
        queryClient.invalidateQueries({ queryKey: ["responder", "shift-history"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_events" }, () => queryClient.invalidateQueries({ queryKey: ["responder", "shift-events"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "responder_profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["responder", "profile"] });
        queryClient.invalidateQueries({ queryKey: ["responder", "team"] });
      }).subscribe();
    let notifChannel: ReturnType<typeof supabase.channel> | null = null;
    if (userId) {
      notifChannel = supabase
        .channel(`responder-notifications-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as { title: string; body: string | null; severity: string };
            queryClient.invalidateQueries({ queryKey: ["responder", "notifications", userId] });
            if (row.severity === "critical") { playAlertTone(); buzz([200, 100, 200]); }
            toast(row.title, { description: row.body ?? undefined });
          },
        )
        .subscribe();
    }

    return () => {
      queryClient.setQueryData(["live-status", "ops"], false);
      supabase.removeChannel(channel);
      supabase.removeChannel(staffChannel);
      if (notifChannel) supabase.removeChannel(notifChannel);
    };
  }, [enabled, userId, queryClient]);
}

/** Signs the responder out after a period of no interaction. */
export function useInactivityLogout(minutes: number, onTimeout: () => void) {
  const cb = useRef(onTimeout);
  cb.current = onTimeout;
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), minutes * 60_000);
    };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
}

/** Responder's live device position, refreshed while on duty. */
export function useOwnPosition(enabled: boolean) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return pos;
}
