import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function useRoles() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const query = useQuery({
    queryKey: ["roles", user.id],
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map(row => row.role);
    },
  });
  const roles: string[] = query.data ?? [];
  const loading = query.isPending;
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
