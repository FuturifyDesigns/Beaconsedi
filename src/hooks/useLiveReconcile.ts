import { useQuery } from "@tanstack/react-query";

/** Keep the original fast fallback if realtime drops; reconcile less when live. */
export function useLiveReconcile(scope: string, fallbackMs: number, connectedMs = 30_000): number {
  const { data: connected } = useQuery({ queryKey: ["live-status", scope], initialData: false, enabled: false });
  return connected ? connectedMs : fallbackMs;
}
