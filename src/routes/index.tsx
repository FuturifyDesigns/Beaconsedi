import { createFileRoute, Link } from "@tanstack/react-router";
import { Siren, MapPin, ShieldCheck, HeartPulse, ArrowRight } from "lucide-react";
import rescueImage from "@/assets/medical-rescue-hero.webp";
import firstResponderAction from "@/assets/first-responder-action.jpg";
import respondersTeam from "@/assets/responders-team.jpg";
import { StarOfLife } from "@/components/StarOfLife";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BEACON SEDI EMERGENCY APP — Botswana" },
      { name: "description", content: "Send an SOS, share your live location, and connect with emergency responders in Botswana." },
      { property: "og:title", content: "BEACON SEDI EMERGENCY APP — Botswana" },
      { property: "og:description", content: "One-tap SOS, precise live location, and connected emergency response." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg">
              <StarOfLife className="h-8 w-8" />
            </span>
            BEACON SEDI EMERGENCY APP
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign in
            </Link>

          </nav>
        </div>
      </header>

      <section className="border-b border-border bg-emergency/[0.06]">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-8 md:grid-cols-2 md:py-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emergency/30 bg-emergency/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emergency">Connected ambulance assistance</div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">Prepare today. Stay connected when it matters.</h2>
            <p className="mt-3 max-w-lg text-muted-foreground">Create an account to request assistance, share your location and keep important medical details ready for your assigned response team.</p>
            <Link to="/auth" search={{ mode: "signup" }} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emergency px-6 py-3 font-semibold text-emergency-foreground shadow-[var(--shadow-emergency)] hover:opacity-90">Create account <ArrowRight className="h-4 w-4" /></Link>
            <p className="mt-3 text-xs text-muted-foreground">You need to create an account and sign in to use the service.</p>
          </div>
          <img src={rescueImage} alt="Illustrative medical rescue scene with paramedics assisting a seated patient beside an ambulance" width={1536} height={1024} fetchPriority="high" className="aspect-[3/2] w-full rounded-3xl border border-border object-cover shadow-[var(--shadow-card)]" />
        </div>
      </section>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emergency pulse-emergency" />
              Live location · Connected response
            </div>
            <h1 className="mt-5 text-5xl font-bold tracking-tight md:text-6xl">
              Help arrives, <span className="text-emergency">where you are.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              BEACON SEDI EMERGENCY APP connects patients and ambulance teams through shared location, medical information and response updates. Sign in to access assistance from your account.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">

              <Link
                to="/auth" search={{ mode: "signup" }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-base font-medium hover:bg-accent"
              >
                Create patient account
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Create an account to use assistance, your medical profile and care circle.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-emergency/20 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Example alert</p>
                  <p className="mt-1 text-lg font-semibold">Cardiac emergency</p>
                </div>
                <span className="rounded-full bg-emergency/10 px-3 py-1 text-xs font-semibold text-emergency">DEMO</span>
              </div>
              <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-xl border border-border">
                <img
                  src={firstResponderAction}
                  alt="Emergency medical responders treating a patient beside an ambulance"
                  className="absolute inset-0 h-full w-full object-cover"
                  width={1600}
                  height={1200}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-background/30" />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="relative">
                    <div className="absolute inset-0 -m-4 rounded-full pulse-emergency" />
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-emergency text-emergency-foreground ring-4 ring-background">
                      <MapPin className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                <div className="rounded-lg bg-muted p-2">
                  <p className="font-semibold">±4m</p><p className="text-muted-foreground">Accuracy</p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <p className="font-semibold">2:14</p><p className="text-muted-foreground">ETA</p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <p className="font-semibold">O−</p><p className="text-muted-foreground">Blood</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* On-scene photo band */}
      <section className="relative overflow-hidden border-y border-border">
        <img
          src={respondersTeam}
          alt="Paramedics in high-visibility jackets attending to a patient beside an ambulance at dusk"
          className="h-72 w-full object-cover md:h-96"
          loading="lazy"
          width={1920}
          height={912}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <div className="absolute inset-0">
          <div className="mx-auto flex h-full max-w-6xl items-end px-6 pb-8 md:items-center md:pb-0">
            <div className="max-w-md">
              <p className="text-xs font-semibold uppercase tracking-widest text-emergency">Coordinated ambulance response</p>
              <p className="mt-2 text-xl font-bold md:text-2xl">
                Share your location and stay connected with your assigned response team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-3">
          {[
            { icon: Siren, title: "One-tap SOS", desc: "Sign in to your account, then press and hold to share an assistance request with your location." },
            { icon: MapPin, title: "Pinpoint location", desc: "Share live GPS with your assigned team. Accuracy depends on your device, signal and location permissions." },
            { icon: HeartPulse, title: "Medical profile", desc: "Keep blood type, allergies, conditions and contacts current for authorised response teams." },
            { icon: ShieldCheck, title: "Your account", desc: "Create an account and sign in to access assistance and manage your information." },
            { icon: HeartPulse, title: "Care circle", desc: "Add trusted contacts and keep their details up to date so support is easier to coordinate." },
            { icon: MapPin, title: "Response updates", desc: "Follow your assigned ambulance and receive incident updates through your signed-in account." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border bg-background p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emergency/10 text-emergency">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> BEACON SEDI EMERGENCY APP</p>
          <p>For real emergencies, always dial your local emergency number.</p>
        </div>
      </footer>

    </div>
  );
}
