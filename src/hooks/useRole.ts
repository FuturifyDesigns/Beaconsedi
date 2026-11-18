import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useRoles() {
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoading(false); return; }
      const { data } = await supabase.from("user_roles")
        .select("role").eq("user_id", userData.user.id);
      if (cancelled) return;
      setRoles((data ?? []).map((r) => r.role));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);
  return {
    roles,
    loading,
    isResponder: roles.includes("responder") || roles.includes("crew"),
    isCrew: roles.includes("crew"),
    isAdmin: roles.includes("admin"),
    isHospital: roles.includes("hospital"),
    isOperator: roles.includes("operator"),
    isStaff:
      roles.includes("responder") ||
      roles.includes("crew") ||
      roles.includes("admin") ||
      roles.includes("hospital") ||
      roles.includes("operator"),
  };
}

export function useIsResponder() {
  const { isResponder, loading } = useRoles();
  return { isResponder, loading };
}
