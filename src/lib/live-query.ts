import type { QueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import type { Incident, Unit } from "@/lib/ops";

export type LiveChange = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> };

export function updateLiveList<T>(client: QueryClient, key: QueryKey, update: (rows: T[] | undefined) => T[] | undefined) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  // A first snapshot may have started before this event was committed. Replay
  // the event after that snapshot finishes so it cannot overwrite the update.
  if (query?.state.fetchStatus === "fetching" && query.promise) {
    void query.promise.then(() => client.setQueryData<T[]>(key, update)).catch(() => {});
  }
  client.setQueryData<T[]>(key, update);
}

/** Apply an authorised realtime row without downloading the whole list again. */
export function mergeLiveRows<T extends { id: string }>(rows: T[] | undefined, change: LiveChange, accept: (row: T) => boolean, compare: (a: T, b: T) => number, limit: number): T[] | undefined {
  if (!rows) return rows;
  const id = (change.eventType === "DELETE" ? change.old.id : change.new.id) as string | undefined;
  if (!id) return rows;
  const previous = rows.find(row => row.id === id);
  const next = { ...previous, ...change.new } as T;
  const remainder = rows.filter(row => row.id !== id);
  if (change.eventType !== "DELETE" && accept(next)) remainder.push(next);
  return remainder.sort(compare).slice(0, limit);
}

export function applyIncidentChange(client: QueryClient, change: LiveChange) {
  updateLiveList<Incident>(client, ["ops", "incidents"], rows => mergeLiveRows(rows, change, row => !row.is_test,
    (a, b) => b.created_at.localeCompare(a.created_at), 200));
}

export function applyUnitChange(client: QueryClient, change: LiveChange) {
  updateLiveList<Unit>(client, ["ops", "units"], rows => mergeLiveRows(rows, change, row => !!row.user_id,
    (a, b) => a.call_sign.localeCompare(b.call_sign), Number.MAX_SAFE_INTEGER));
  const id = (change.eventType === "DELETE" ? change.old.id : change.new.id) as string | undefined;
  if (id) client.setQueryData<Unit | null>(["responder", "unit", id], old => old === undefined ? old : change.eventType === "DELETE" ? null : { ...old, ...change.new } as Unit);
}

/** Reassignments clear the former crew's vehicle; GPS changes need no extra reads. */
export function applyAssignedVehicleChange(client: QueryClient, userId: string | undefined, change: LiveChange) {
  if (!userId) return;
  const key = ["responder", "assigned-vehicle", userId];
  const update = (current: Unit | null | undefined) => {
    const id = (change.eventType === "DELETE" ? change.old.id : change.new.id) as string;
    if (change.eventType !== "DELETE" && change.new.user_id === userId) return { ...current, ...change.new } as Unit;
    return current?.id === id ? null : current;
  };
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  if (query?.state.fetchStatus === "fetching" && query.promise) {
    void query.promise.then(() => client.setQueryData(key, update)).catch(() => {});
  }
  client.setQueryData(key, update);
}

type Shared = { count: number; stop: () => void };
const subscriptions = new WeakMap<object, Map<string, Shared>>();

/** Multiple mounted consumers share one subscription to the same private data. */
export function retainSubscription(owner: object, key: string, start: () => () => void): () => void {
  let channels = subscriptions.get(owner);
  if (!channels) { channels = new Map(); subscriptions.set(owner, channels); }
  let shared = channels.get(key);
  if (!shared) { shared = { count: 0, stop: start() }; channels.set(key, shared); }
  shared.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--shared!.count === 0) { channels!.delete(key); shared!.stop(); }
  };
}
