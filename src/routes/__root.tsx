import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function dismissSplash() { document.getElementById("beacon-startup")?.setAttribute("data-ready", "true"); }

function NotFoundComponent() {
  useEffect(dismissSplash, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  useEffect(dismissSplash, []);
  console.error(error);
  const router = useRouter();
  const path = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    if (!/^\/(crew|responder|operations|sos|referrals|care)(\/|$)/.test(path)) return;
    // Fetch the shared SDK while authentication and dashboard data are loading.
    void import("@/lib/google-maps-loader").then(({ loadGoogleMaps }) => loadGoogleMaps()).catch(() => {});
  }, [path]);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#081a30" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "BEACON SEDI" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "Beacon Sedi | Connected ambulance assistance" },
      { name: "description", content: "Create an account to request ambulance assistance, share your location and follow response updates." },
      { name: "author", content: "BEACON SEDI EMERGENCY APP" },
      { property: "og:title", content: "Beacon Sedi | Connected ambulance assistance" },
      { property: "og:description", content: "Create an account to request ambulance assistance, share your location and follow response updates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Beacon Sedi | Connected ambulance assistance" },
      { name: "twitter:description", content: "Create an account to request ambulance assistance, share your location and follow response updates." },
      { property: "og:image", content: "https://beaconsedi.beaconsedi-bw.workers.dev/branding/icon-512.png" },
      { name: "twitter:image", content: "https://beaconsedi.beaconsedi-bw.workers.dev/branding/icon-512.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "apple-touch-startup-image", href: "/branding/startup-750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/branding/startup-1125x2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/branding/startup-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/branding/startup-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/branding/startup-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/branding/startup-1320x2868.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/branding/startup-1668x2388.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/branding/startup-2048x2732.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },

      { rel: "preconnect", href: "https://maps.googleapis.com" },
      { rel: "preconnect", href: "https://maps.gstatic.com", crossOrigin: "anonymous" },
      { rel: "icon", href: `${import.meta.env.BASE_URL}branding/favicon-20261122.ico`, type: "image/x-icon" },
      { rel: "manifest", href: `${import.meta.env.BASE_URL}manifest.webmanifest` },
      { rel: "apple-touch-icon", href: `${import.meta.env.BASE_URL}branding/apple-touch-icon.png` },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><HeadContent /><script dangerouslySetInnerHTML={{__html: "if(navigator.standalone||matchMedia('(display-mode: standalone)').matches){document.documentElement.dataset.beaconPwa='true'}setTimeout(function(){document.getElementById('beacon-startup')?.setAttribute('data-ready','true')},8000)"}} /></head>
      <body>
        <div id="beacon-startup" className="beacon-startup" role="status" aria-label="Loading Beacon Sedi"><img src="/branding/beacon-sedi-logo.png" alt="" width="120" height="120"/><strong>BEACON SEDI</strong><p>Medical response. Connected.</p><span aria-hidden="true"/></div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const loading = useRouterState({ select: (state) => state.isLoading });
  useEffect(() => { if (!loading) dismissSplash(); }, [loading]);
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const path = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    if (!/^\/(crew|responder|operations|sos|referrals|care)(\/|$)/.test(path)) return;
    // Fetch the shared SDK while authentication and dashboard data are loading.
    void import("@/lib/google-maps-loader").then(({ loadGoogleMaps }) => loadGoogleMaps()).catch(() => {});
  }, [path]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") queryClient.clear();
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  // Offline 997 fallback: register the service worker on the installed/published app only
  // (never inside the editor preview iframe, to avoid stale cached previews).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const inIframe = window.self !== window.top;
    const isPreview = window.location.hostname.includes("id-preview--") || window.location.hostname === "localhost";
    if (inIframe || isPreview) return;
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
