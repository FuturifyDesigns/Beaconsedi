import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CERT_LEVELS, type ResponderProfile } from "@/lib/responder";
import { phoneValue, textValue } from "@/lib/validation";

export function useStaffShiftControls() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (action: "clock_in" | "clock_out" | "break_start" | "break_end") => {
      const { error } = await supabase.rpc("change_own_shift" as never, { _action: action } as never);
      if (error) throw error;
      return action;
    },
    onSuccess: async (action) => {
      await client.invalidateQueries({ queryKey: ["responder"] });
      toast.success({ clock_in: "Clocked in", clock_out: "Clocked out", break_start: "Break started", break_end: "Break ended" }[action]);
    },
    onError: (error) => toast.error(error.message),
  });
  return { change: mutation.mutate, busy: mutation.isPending };
}

export function useStaffProfileEditor(user: { id: string; email: string } | null) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (draft: Partial<ResponderProfile>) => {
      if (!user) throw new Error("Sign in to save your team profile");
      const fields = ["full_name", "national_id", "employee_number", "responder_code", "photo_url", "gender", "phone", "email", "home_station", "license_number", "organization", "department", "rank"] as const;
      const payload: Record<string, unknown> = { user_id: user.id };
      for (const field of fields) payload[field] = textValue(draft[field], field.replace(/_/g, " "), field === "photo_url" ? 2048 : field === "full_name" ? 200 : 400, field === "full_name");
      payload.phone = phoneValue(draft.phone);
      payload.email = textValue(draft.email || user.email, "Email", 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) throw new Error("Enter a valid email");
      payload.date_of_birth = draft.date_of_birth || null;
      payload.license_expiry = draft.license_expiry || null;
      payload.certification_level = draft.certification_level || "emt_basic";
      if (!(String(payload.certification_level) in CERT_LEVELS)) throw new Error("Choose a valid certification level");
      payload.years_of_service = draft.years_of_service ?? 0;
      if (!Number.isInteger(payload.years_of_service) || Number(payload.years_of_service) < 0 || Number(payload.years_of_service) > 80) throw new Error("Years of service must be between 0 and 80");
      const { error } = await supabase.from("responder_profiles").upsert(payload as never, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["responder", "profile"] });
      await client.invalidateQueries({ queryKey: ["responder", "team"] });
      toast.success("Team profile saved");
    },
    onError: (error) => toast.error(error.message),
  });
  return { save: mutation.mutate, saving: mutation.isPending };
}
