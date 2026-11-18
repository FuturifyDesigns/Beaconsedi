import { createFileRoute, Link } from "@tanstack/react-router";
import { Siren, MapPin, ShieldCheck, HeartPulse, ArrowRight, PhoneCall } from "lucide-react";
import { buzz } from "@/lib/haptics";
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
    <div className="min-h-screen bg-background pb-28 text-foreground md:pb-0">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emergency text-emergency-foreground">
              <StarOfLife className="h-5 w-5" />
            </span>
            BEACON SEDI EMERGENCY APP
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Link to="/sos" className="inline-flex items-center gap-1.5 rounded-md bg-emergency px-4 py-2 text-sm font-semibold text-emergency-foreground shadow-[var(--shadow-emergency)] hover:opacity-90">
              Emergency SOS <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Emergency SOS — first thing anyone sees, no sign-in needed */}
      <section className="border-b border-border bg-emergency/[0.06]">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:py-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emergency/30 bg-emergency/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emergency">
              <span className="h-2 w-2 rounded-full bg-emergency pulse-emergency" />
              No account needed
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              In an emergency? Send an SOS now.
            </h2>
            <p className="mt-3 max-w-lg text-muted-foreground">
              Tap the big red button to open the emergency screen, then press and hold to send your live
              GPS location to responders. You do not need to sign in.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 md:w-80">
            <Link
              to="/sos"
              aria-label="Start an emergency SOS alert — no sign-in needed"
              onClick={() => buzz([40, 60, 40])}
              className="relative flex min-h-36 flex-col items-center justify-center gap-1 rounded-3xl bg-emergency px-8 text-emergency-foreground shadow-[var(--shadow-emergency)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emergency/40"
            >
              <span className="absolute inset-0 rounded-3xl pulse-emergency" aria-hidden="true" />
              <Siren className="h-12 w-12" aria-hidden="true" />
              <span className="text-4xl font-black uppercase leading-none tracking-[0.2em]">SOS</span>
              <span className="mt-1 text-sm font-semibold uppercase tracking-wide">
                Emergency alert — tap to start
              </span>
            </Link>
            <a
              href="tel:997"
              onClick={() => buzz([40, 60, 40])}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-emergency/40 bg-card px-5 text-base font-semibold text-emergency hover:bg-emergency/10"
            >
              <PhoneCall className="h-5 w-5" aria-hidden="true" />
              Or call 997 — Botswana emergency
            </a>
            <p className="text-center text-xs text-muted-foreground">
              Calls work even with no internet. SOS needs data or Wi-Fi for live location.
            </p>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emergency pulse-emergency" />
              Live location · 24/7 responders
            </div>
            <h1 className="mt-5 text-5xl font-bold tracking-tight md:text-6xl">
              Help arrives, <span className="text-emergency">where you are.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              BEACON SEDI EMERGENCY APP links patients to emergency responders with one tap — sharing pinpoint GPS
              location and vital medical info on precise, end-to-end maps.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/sos"
                className="inline-flex items-center gap-2 rounded-lg bg-emergency px-6 py-3 text-base font-semibold text-emergency-foreground shadow-[var(--shadow-emergency)] hover:opacity-90"
              >
                <Siren className="h-5 w-5" /> Send SOS now
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-base font-medium hover:bg-accent"
              >
                Create patient account
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No account needed for emergencies · Medical profile persists when signed in
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
              <p className="text-xs font-semibold uppercase tracking-widest text-emergency">On scene in minutes</p>
              <p className="mt-2 text-xl font-bold md:text-2xl">
                Trained responders dispatched to your exact coordinates.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-3">
          {[
            { icon: Siren, title: "One-tap SOS", desc: "Hold to send. No forms, no fuss. Anonymous alerts work without an account." },
            { icon: MapPin, title: "Pinpoint location", desc: "High-accuracy GPS on Google Maps, streamed live to the responder dashboard." },
            { icon: HeartPulse, title: "Medical profile", desc: "Blood type, allergies, conditions and contacts arrive with your alert." },
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

      {/* Sticky emergency bar on phones */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Link
            to="/sos"
            onClick={() => buzz([40, 60, 40])}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-emergency text-base font-bold uppercase tracking-wide text-emergency-foreground shadow-[var(--shadow-emergency)]"
          >
            <Siren className="h-5 w-5" aria-hidden="true" /> Send SOS
          </Link>
          <a
            href="tel:997"
            onClick={() => buzz([40, 60, 40])}
            className="flex min-h-14 items-center justify-center gap-1.5 rounded-xl border border-emergency/40 px-4 text-sm font-semibold text-emergency"
          >
            <PhoneCall className="h-4 w-4" aria-hidden="true" /> 997
          </a>
        </div>
      </div>
    </div>
  );
}
