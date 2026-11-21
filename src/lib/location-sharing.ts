type Fix = { latitude: number; longitude: number; accuracy: number; at: number };

/** Keep position changes live while avoiding identical stationary SOS writes. */
export function shouldSharePatientFix(last: Fix | null, next: Fix): boolean {
  if (!last) return true;
  const elapsed = next.at - last.at;
  if (elapsed < 1000) return false;
  const dy = (next.latitude - last.latitude) * 111_320;
  const dx = (next.longitude - last.longitude) * 111_320 * Math.cos(next.latitude * Math.PI / 180);
  return elapsed >= 15_000 || Math.hypot(dx, dy) >= 5 || next.accuracy < last.accuracy * .65;
}
