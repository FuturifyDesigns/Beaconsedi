import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useIsResponder } from "@/hooks/useRole";
import {
  assignVehicleToResponder,
  getAdminStatus,
  grantRole,
  listVehicleAssignments,
  listUsersWithRoles,
  revokeRole,
} from "@/lib/admin.functions";
import { Shield, ShieldCheck, ShieldOff, UserRound, Radio, Ambulance, Building2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddVehicleCard, JoinQrCard } from "@/components/admin/AdminExtras";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Roles and vehicles — BEACON SEDI" },
    { name: "description", content: "Administrator access for roles and emergency vehicles." },
    { property: "og:title", content: "Roles and vehicles — BEACON SEDI" },
    { property: "og:description", content: "Administrator access for roles and emergency vehicles." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminPage,
});

type Role = "patient" | "responder" | "crew" | "admin" | "hospital" | "operator";

function AdminPage() {
  const { isResponder } = useIsResponder();
  const qc = useQueryClient();
  const statusFn = useServerFn(getAdminStatus);
  const listFn = useServerFn(listUsersWithRoles);
  const grantFn = useServerFn(grantRole);
  const revokeFn = useServerFn(revokeRole);
  const assignmentsFn = useServerFn(listVehicleAssignments);
  const assignVehicleFn = useServerFn(assignVehicleToResponder);
  const [filter, setFilter] = useState("");

  const status = useQuery({ queryKey: ["admin-status"], queryFn: () => statusFn() });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: !!status.data?.isAdmin,
  });
  const vehicles = useQuery({
    queryKey: ["admin-vehicle-assignments"],
    queryFn: () => assignmentsFn(),
    enabled: !!status.data?.isAdmin,
  });

  const grant = useMutation({
    mutationFn: (v: { userId: string; role: Role }) => grantFn({ data: v }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin-users"] }); await qc.invalidateQueries({ queryKey: ["roles"] }); },
  });
  const revoke = useMutation({
    mutationFn: (v: { userId: string; role: Role }) => revokeFn({ data: v }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-users"] }),
        qc.invalidateQueries({ queryKey: ["admin-vehicle-assignments"] }),
        qc.invalidateQueries({ queryKey: ["roles"] }),
      ]);
    },
  });
  const assignVehicle = useMutation({
    mutationFn: (value: { userId: string; email: string; unitId: string | null }) => assignVehicleFn({ data: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vehicle-assignments"] }),
  });

  return (
    <AppShell isResponder={isResponder}>
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <header className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-emergency/10 text-emergency">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Role management</h1>
            <p className="text-sm text-muted-foreground">
              Grant responder or admin access to registered users.
            </p>
          </div>
        </header>

        {status.error && <p role="alert" className="text-sm text-destructive">Unable to check administrator access. Please reload.</p>}
        {status.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {status.data && !status.data.isAdmin && (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              You don't have admin access. Ask an existing admin to grant you a role.
            </p>
          </div>
        )}

        {status.data?.isAdmin && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <JoinQrCard />
              <AddVehicleCard />
            </div>
            <input
              maxLength={254}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by email…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            {users.isLoading && <p className="text-sm text-muted-foreground">Loading users…</p>}
            {users.error && (
              <p className="text-sm text-destructive">{(users.error as Error).message}</p>
            )}
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {(users.data ?? [])
                .filter((u) => u.email.toLowerCase().includes(filter.toLowerCase()))
                .map((u) => {
                  const has = (r: Role) => u.roles.includes(r);
                  return (
                    <li key={u.id} className="space-y-4 p-4 sm:p-5">
                      <div className="min-w-0">
                        <p className="flex min-w-0 items-start gap-2 font-medium">
                          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 break-all">{u.email || u.id}</span>
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                          {u.roles.length === 0 && <span>no roles</span>}
                          {u.roles.map((r) => (
                            <span
                              key={r}
                              className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide"
                            >
                              {r}
                            </span>
                          ))}
                        </p>
                      </div>
                      <div className="space-y-3">
                        {(has("responder") || has("crew")) && (
                          <label className="grid w-full min-w-0 gap-1.5 text-xs text-muted-foreground sm:max-w-md">
                            <span className="inline-flex items-center gap-1.5"><Ambulance className="h-4 w-4 shrink-0" aria-hidden="true" />Assigned vehicle</span>
                            <select
                              aria-label={`Assigned vehicle for ${u.email}`}
                              value={(vehicles.data ?? []).find((vehicle) => vehicle.assigned_user_id === u.id)?.id ?? ""}
                              onChange={(event) => assignVehicle.mutate({
                                userId: u.id,
                                email: u.email,
                                unitId: event.target.value || null,
                              })}
                              disabled={assignVehicle.isPending || vehicles.isLoading}
                              className="min-h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground disabled:opacity-50"
                            >
                              <option value="">No vehicle assigned</option>
                              {(vehicles.data ?? []).map((vehicle) => {
                                const assignedElsewhere = !!vehicle.assigned_user_id && vehicle.assigned_user_id !== u.id;
                                return (
                                  <option key={vehicle.id} value={vehicle.id} disabled={assignedElsewhere}>
                                    {vehicle.call_sign} · {vehicle.name} · {vehicle.status}{assignedElsewhere ? " · assigned" : ""}
                                  </option>
                                );
                              })}
                            </select>
                          </label>
                        )}
                        <div aria-label={`Roles for ${u.email}`} className="grid grid-cols-2 items-stretch gap-2 sm:grid-cols-3 xl:grid-cols-5">
                        <RoleToggle
                          label="Responder"
                          icon={<Radio className="h-3.5 w-3.5" />}
                          active={has("responder")}
                          onGrant={() => grant.mutate({ userId: u.id, role: "responder" })}
                          onRevoke={() => revoke.mutate({ userId: u.id, role: "responder" })}
                          pending={grant.isPending || revoke.isPending}
                        />
                        <RoleToggle
                          label="Crew"
                          icon={<Ambulance className="h-3.5 w-3.5" />}
                          active={has("crew")}
                          onGrant={() => grant.mutate({ userId: u.id, role: "crew" })}
                          onRevoke={() => revoke.mutate({ userId: u.id, role: "crew" })}
                          pending={grant.isPending || revoke.isPending}
                        />
                        <RoleToggle
                          label="Hospital"
                          icon={<Building2 className="h-3.5 w-3.5" />}
                          active={has("hospital")}
                          onGrant={() => grant.mutate({ userId: u.id, role: "hospital" })}
                          onRevoke={() => revoke.mutate({ userId: u.id, role: "hospital" })}
                          pending={grant.isPending || revoke.isPending}
                        />
                        <RoleToggle
                          label="Operator"
                          icon={<Truck className="h-3.5 w-3.5" />}
                          active={has("operator")}
                          onGrant={() => grant.mutate({ userId: u.id, role: "operator" })}
                          onRevoke={() => revoke.mutate({ userId: u.id, role: "operator" })}
                          pending={grant.isPending || revoke.isPending}
                        />
                        <RoleToggle
                          label="Admin"
                          icon={<ShieldCheck className="h-3.5 w-3.5" />}
                          active={has("admin")}
                          onGrant={() => grant.mutate({ userId: u.id, role: "admin" })}
                          onRevoke={() => revoke.mutate({ userId: u.id, role: "admin" })}
                          pending={grant.isPending || revoke.isPending}
                        />
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
            {(grant.error || revoke.error || assignVehicle.error || vehicles.error) && (
              <p className="text-sm text-destructive">
                {((grant.error || revoke.error || assignVehicle.error || vehicles.error) as Error).message}
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function RoleToggle({
  label,
  icon,
  active,
  onGrant,
  onRevoke,
  pending,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onGrant: () => void;
  onRevoke: () => void;
  pending: boolean;
}) {
  return active ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRevoke}
      disabled={pending}
      className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2 text-left leading-tight text-muted-foreground"
    >
      <ShieldOff className="h-3.5 w-3.5" /> Revoke {label}
    </Button>
  ) : (
    <Button
      type="button"
      size="sm"
      onClick={onGrant}
      disabled={pending}
      className="h-auto min-h-11 w-full justify-start whitespace-normal bg-emergency px-3 py-2 text-left leading-tight text-emergency-foreground hover:bg-emergency/90"
    >
      {icon} Grant {label}
    </Button>
  );
}
