import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [
    { title: "Signing in — BEACON SEDI" },
    { name: "description", content: "Completing your secure sign-in." },
    { property: "og:title", content: "Signing in — BEACON SEDI" },
    { property: "og:description", content: "Completing your secure sign-in." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Callback,
});

function Callback() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      navigate({ to: data.user ? "/dashboard" : "/auth", replace: true });
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate({ to: "/dashboard", replace: true });
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [navigate]);
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
