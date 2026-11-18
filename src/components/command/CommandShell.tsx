import type { ReactNode } from "react";
import { AVAILABILITY, initials, type ResponderProfile } from "@/lib/responder";
import { Bell, LogOut } from "lucide-react";
import { StarOfLife } from "@/components/StarOfLife";

export type SectionKey =
  | "dashboard"
  | "incidents"
  | "history"
  | "vehicle"
  | "shift"
  | "team"
  | "notifications"
  | "profile"
  | "settings";

type NavItem = { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number };

type Props = {
  nav: NavItem[];
  section: SectionKey;
  onSection: (s: SectionKey) => void;
  profile: ResponderProfile | null;
  email: string;
  vehicleLabel: string;
  shiftLabel: string;
  unreadCount: number;
  onSignOut: () => void;
  onAvailability: (value: string) => void;
  children: ReactNode;
};

export function CommandShell({
  nav, section, onSection, profile, email, vehicleLabel, shiftLabel, unreadCount, onSignOut, onAvailability, children,
}: Props) {
  const availability = AVAILABILITY[profile?.availability ?? "offline"] ?? AVAILABILITY.offline;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#command-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm">
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur lg:flex">
        <div className="flex items-center gap-2 px-4 py-4 text-sm font-semibold text-sidebar-foreground">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emergency text-emergency-foreground" aria-hidden="true">
            <StarOfLife className="h-5 w-5" />
          </span>
          <span>
            BEACON SEDI
            <span className="block text-[10px] font-normal uppercase tracking-wider text-muted-foreground">Responder command</span>
          </span>
        </div>
        <nav aria-label="Responder navigation" className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {nav.map(({ key, label, icon: Icon, badge }) => {
            const active = section === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSection(key)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition motion-reduce:transition-none ${
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
                {!!badge && (
                  <span className="ml-auto rounded-full bg-emergency px-1.5 py-0.5 text-[10px] font-semibold text-emergency-foreground">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-56">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile?.full_name ?? email ?? "Responder"}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {shiftLabel} · {vehicleLabel}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${availability.chip}`}>
              <span className={`h-2 w-2 rounded-full ${availability.dot}`} aria-hidden="true" />
              {availability.label}
            </span>
            <label className="sr-only" htmlFor="availability-select">Set availability</label>
            <select
              id="availability-select"
              value={profile?.availability ?? "offline"}
              onChange={(e) => onAvailability(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
            >
              {Object.entries(AVAILABILITY).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onSection("notifications")}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              className="relative grid h-11 w-11 place-items-center rounded-lg border border-border bg-card"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {!!unreadCount && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-emergency px-1 text-[10px] font-bold text-emergency-foreground">
                  {unreadCount}
                </span>
              )}
            </button>
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
            >
              {profile?.photo_url ? (
                <img src={profile.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(profile?.full_name ?? email)
              )}
            </span>
          </div>
        </header>

        {/* Mobile / tablet nav */}
        <nav aria-label="Responder sections" className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 lg:hidden">
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSection(key)}
              aria-current={section === key ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs ${
                section === key ? "bg-emergency/15 text-emergency" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>

        <main id="command-main" className="p-4">{children}</main>
      </div>
    </div>
  );
}
