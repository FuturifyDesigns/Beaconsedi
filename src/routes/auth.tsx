import { PHONE_PATTERN, phoneValue, textValue } from "@/lib/validation";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { StarOfLife } from "@/components/StarOfLife";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BEACON SEDI EMERGENCY APP" },
      { name: "description", content: "Sign in or create a BEACON SEDI EMERGENCY APP patient account." },
      { property: "og:title", content: "Sign in — BEACON SEDI EMERGENCY APP" },
      { property: "og:description", content: "Sign in or create a patient emergency account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setMode("signup");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        textValue(fullName, "Full name", 200, true);
        phoneValue(phone);
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { full_name: fullName.trim(), phone: phone.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) { toast.success("Check your email to confirm your account before signing in."); return; }
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auth failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const callback = new URL(import.meta.env.BASE_URL + "auth/callback", window.location.origin).href;
    const hostedOnLovable = /\.(lovable\.app|lovableproject\.com|lovableproject-dev\.com)$/.test(window.location.hostname);
    if (!hostedOnLovable) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback },
      });
      if (error) toast.error(error.message || "Google sign-in failed");
      return;
    }
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: callback });
    if (result.error) {
      toast.error(result.error.message || "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100vh-49px)] max-w-md place-items-center px-4 py-5 sm:py-10">
        <div className="w-full">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emergency text-emergency-foreground">
              <StarOfLife className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BEACON SEDI EMERGENCY APP</p>
              <h1 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create account"}</h1>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-card)]">
            <button
              type="button" onClick={handleGoogle}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or email <span className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <>
                  <input maxLength={200}
                    type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                  <input maxLength={25} pattern={PHONE_PATTERN} title="Enter 7–15 digits, with an optional country code"
                    type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone (for responder callback)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                </>
              )}
              <input maxLength={254}
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
              <input maxLength={128}
                type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
              <button
                type="submit" disabled={loading}
                className="w-full rounded-lg bg-emergency px-4 py-2.5 text-sm font-semibold text-emergency-foreground hover:opacity-90 disabled:opacity-70"
              >
                {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              {mode === "signin" ? "New here?" : "Have an account?"}{" "}
              <button
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="font-medium text-foreground hover:underline"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            In an emergency you don't need an account.{" "}
            <Link to="/sos" className="font-medium text-emergency hover:underline">Send anonymous SOS →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
