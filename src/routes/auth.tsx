import { hasRegisteredAccount } from "@/lib/account-access";
import { PHONE_PATTERN, phoneValue, textValue } from "@/lib/validation";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { StarOfLife } from "@/components/StarOfLife";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" } => search.mode === "signup" ? { mode: "signup" } : {},
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
  const { mode: requestedMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(requestedMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      void fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((settings) => { if (!controller.signal.aborted) setGoogleEnabled(settings?.external?.google === true); })
        .catch(() => {});
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setMode(requestedMode ?? "signin");
  }, [requestedMode]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (hasRegisteredAccount(data.user)) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setFormError("");
    setConfirmationEmail("");
    setLoading(true);
    try {
      if (mode === "signup") {
        textValue(fullName, "Full name", 200, true);
        phoneValue(phone);
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: window.location.origin + "/auth/callback",
            data: { full_name: fullName.trim(), phone: phone.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) { setConfirmationEmail(email.trim()); return; }
        toast.success("Account created. You're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auth failed";
      setFormError(msg);
    } finally {
      submitting.current = false;
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
            <span className="grid h-10 w-10 place-items-center rounded-xl">
              <StarOfLife className="h-9 w-9" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BEACON SEDI EMERGENCY APP</p>
              <h1 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create account"}</h1>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-[var(--shadow-card)]">
            {googleEnabled && <><button
              type="button" onClick={handleGoogle} disabled={loading}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent"
            >
              Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or email <span className="h-px flex-1 bg-border" />
            </div></>}
            {confirmationEmail && <p role="status" className="mb-4 rounded-lg border border-border bg-muted p-3 text-sm">Check the inbox for {confirmationEmail} to confirm your account, then sign in. If you already registered, use Sign in below.</p>}
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <>
                  <input maxLength={200}
                    type="text" required autoComplete="name" aria-label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                  <input maxLength={25} pattern={PHONE_PATTERN} title="Enter 7–15 digits, with an optional country code"
                    type="tel" autoComplete="tel" aria-label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone (for responder callback)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                </>
              )}
              <input maxLength={254}
                type="email" required autoComplete="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
              <input maxLength={128}
                type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
              {mode === "signup" && <>
                <p className="text-xs text-muted-foreground">Use at least 6 characters for your password.</p>
                <input type="password" required minLength={6} maxLength={128} autoComplete="new-password" aria-label="Confirm password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2" />
              </>}
              {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
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
                disabled={loading}
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setFormError(""); setConfirmationEmail(""); setPassword(""); setConfirmPassword(""); }}
                className="font-medium text-foreground hover:underline"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Create an account and sign in to request assistance and use the service.
          </p>
        </div>
      </main>
    </div>
  );
}
