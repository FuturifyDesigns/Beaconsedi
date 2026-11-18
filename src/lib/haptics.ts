/** Fires a haptic buzz where supported; silently no-ops elsewhere. */
export function buzz(pattern: number | number[]) {
  if (typeof window === "undefined") return;
  try {
    if ("vibrate" in navigator) navigator.vibrate?.(pattern);
  } catch {
    /* haptics unavailable */
  }
}
