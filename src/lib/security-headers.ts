/**
 * Beacon security headers.
 *
 * Design rules:
 *  - COOP is `same-origin-allow-popups`, NOT `same-origin`. Beacon opens the Google
 *    OAuth popup for sign-in; `same-origin` severs the opener relationship and the
 *    popup can never hand the session back. Beacon does not need cross-origin
 *    isolation (no SharedArrayBuffer / wasm threads), so the stricter value buys
 *    nothing and breaks auth.
 *  - COEP is intentionally NOT set. `require-corp` would block Google Maps tiles,
 *    fonts, Google auth iframes and Supabase responses, none of which send CORP
 *    headers. Enable it only if Beacon ever needs cross-origin isolation.
 *  - CORP is `same-site`: Beacon's own documents/assets may be embedded by Lovable
 *    preview/publish hosts but not by arbitrary third parties.
 *  - CSP is a strict allowlist. Every domain below is required; see comments.
 *  - `frame-ancestors` allows the Lovable editor only when serving a Lovable preview.
 */

/** Third-party origins, each with the reason it is required. */
const CSP_SOURCES = {
  /** Maps JS API bootstrap + Google auth (popup/iframe) scripts. */
  script: ["https://maps.googleapis.com", "https://maps.gstatic.com", "https://accounts.google.com"],
  /** Map tiles, marker sprites, Street View imagery, OG assets. */
  img: [
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://*.google.com",
    "https://*.ggpht.com",
    "https://storage.googleapis.com",
  ],
  /** Maps JS XHR/tile fetches, Lovable Cloud REST + realtime websocket. */
  connect: [
    "https://maps.googleapis.com",
    "https://*.googleapis.com",
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ],
  /** Google OAuth consent iframe/popup. */
  frame: ["https://accounts.google.com", "https://*.google.com"],
  /** Google Fonts stylesheet + files (only if a font link is added later). */
  style: ["https://fonts.googleapis.com"],
  font: ["https://fonts.gstatic.com"],
  /** Hosts allowed to embed Beacon (Lovable editor preview + published app). */
  frameAncestors: ["https://*.lovable.app", "https://*.lovableproject.com", "https://lovable.dev"],
} as const;

export function contentSecurityPolicy(dev: boolean, lovablePreview = false): string {
  const scriptExtra = dev ? ["'unsafe-eval'"] : [];
  const connectExtra = dev ? ["ws:", "http://localhost:*"] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' is required for the framework's inline hydration/head scripts.
    "script-src": ["'self'", "'unsafe-inline'", ...scriptExtra, ...CSP_SOURCES.script],
    "style-src": ["'self'", "'unsafe-inline'", ...CSP_SOURCES.style],
    "font-src": ["'self'", "data:", ...CSP_SOURCES.font],
    "img-src": ["'self'", "data:", "blob:", ...CSP_SOURCES.img],
    "connect-src": ["'self'", ...connectExtra, ...CSP_SOURCES.connect],
    "frame-src": ["'self'", ...CSP_SOURCES.frame],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "data:", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'", ...(lovablePreview ? CSP_SOURCES.frameAncestors : [])],
  };
  if (!dev) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

export function securityHeaders(dev: boolean, lovablePreview = false): Record<string, string> {
  return {
    // Keeps the Google OAuth popup usable while isolating the browsing context.
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    // NOTE: Cross-Origin-Embedder-Policy deliberately omitted (see file header).
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Content-Type-Options": "nosniff",
    // Origin-only cross-site referrers work with host-scoped Google Maps browser keys.
    "Referrer-Policy": "origin-when-cross-origin",
    // Geolocation is the core SOS capability and must stay allowed for this origin.
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(self), payment=(), usb=()",
    "Content-Security-Policy": contentSecurityPolicy(dev, lovablePreview),
    ...(dev ? {} : { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }),
  };
}
