import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, User, Radio, LogOut, Shield, Activity, Ambulance, HeartHandshake, ArrowLeftRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRoles } from "@/hooks/useRole";
import { StarOfLife } from "@/components/StarOfLife";

type Props = { children: ReactNode; isResponder?: boolean };

export function AppShell({ children }: Props) {
  const { isResponder, isAdmin, isStaff } = useRoles();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(isAdmin ? [{ to: "/operations", label: "Operations", icon: Activity }] : []),
    ...(isStaff ? [{ to: "/referrals", label: "Referrals", icon: ArrowLeftRight }] : []),
    ...((isResponder || isAdmin)
      ? [
          { to: "/responder", label: "Responder", icon: Radio },
          { to: "/crew", label: "Crew dashboard", icon: Ambulance },
        ]
      : []),
    { to: "/care", label: "Care circle", icon: HeartHandshake },
    { to: "/profile", label: "Medical profile", icon: User },
    ...(isAdmin ? [{ to: "/admin", label: "Roles", icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emergency text-emergency-foreground">
            <StarOfLife className="h-5 w-5" />
          </span>
          <span className="leading-tight">BEACON SEDI<span className="block text-[10px] font-medium text-muted-foreground">EMERGENCY APP</span></span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link
                key={to} to={to}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border px-3 py-3">
          <p className="truncate px-3 pb-2 text-xs text-muted-foreground">{email}</p>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-emergency text-emergency-foreground">
            <StarOfLife className="h-4 w-4" />
          </span>
          <span className="text-xs">BEACON SEDI</span>
        </Link>
        <button onClick={signOut} className="text-xs text-muted-foreground">Sign out</button>
      </header>
      <div className="md:pl-60">
        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-1 overflow-x-auto border-t border-border bg-background px-2 py-2 md:hidden">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link key={to} to={to} className={`flex shrink-0 flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] ${active ? "text-emergency" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" /> {label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
        <main className="pb-20 md:pb-0">{children}</main>
      </div>
    </div>
  );
}
