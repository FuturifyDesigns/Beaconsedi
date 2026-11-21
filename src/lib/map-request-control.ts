/** A request clock independent of GPS renders. Results are never persisted. */
export function createLatestRequestLoop<Input, Result>(options: {
  latest: () => Input | null;
  request: (input: Input) => Promise<Result>;
  onValue: (value: Result) => void;
  onError: (error: unknown) => void;
  onLoading: (loading: boolean) => void;
  intervalMs: number;
  available: () => boolean;
  shouldRefresh: (last: Input, next: Input, elapsedMs: number) => boolean;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let active = true, busy = false, attemptedAt = -Infinity;
  let last: Input | null = null, succeededAt = 0;
  return {
    async tick(): Promise<boolean> {
      const input = options.latest();
      if (!active || busy || input === null || !options.available() || now() - attemptedAt < options.intervalMs) return false;
      if (last !== null && !options.shouldRefresh(last, input, now() - succeededAt)) return false;
      busy = true; attemptedAt = now(); options.onLoading(true);
      try {
        const result = await options.request(input);
        if (active) { last = input; succeededAt = now(); options.onValue(result); }
      } catch (error) {
        last = null;
        if (active) options.onError(error);
      } finally { busy = false; if (active) options.onLoading(false); }
      return true;
    },
    stop() { active = false; },
  };
}

/** Coalesce only simultaneous identical requests; keep no completed API data. */
const pending = new Map<string, Promise<unknown>>();
export function coalesceMapRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const task = Promise.resolve().then(request).finally(() => { pending.delete(key); });
  pending.set(key, task);
  return task;
}
