type Point = { lat: number; lng: number };
export const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
export const headingDifference = (from: number, to: number) => ((to - from + 540) % 360) - 180;
export function travelBearing(from: Point, to: Point) {
  const a = from.lat * Math.PI / 180, b = to.lat * Math.PI / 180;
  const delta = (to.lng - from.lng) * Math.PI / 180;
  return normalizeHeading(Math.atan2(Math.sin(delta) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta)) * 180 / Math.PI);
}
function offset(from: Point, to: Point) {
  return { x: (to.lng - from.lng) * 111320 * Math.cos(from.lat * Math.PI / 180), y: (to.lat - from.lat) * 111320 };
}
export function routeBearing(position: Point, paths: Point[][]) {
  let closest = 35, heading: number | null = null;
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = offset(position, path[i - 1]), b = offset(position, path[i]);
    const x = b.x - a.x, y = b.y - a.y, length = x*x + y*y;
    if (length < 1) continue;
    const t = Math.max(0, Math.min(1, -(a.x*x + a.y*y) / length));
    const distance = Math.hypot(a.x + t*x, a.y + t*y);
    if (distance < closest) { closest = distance; heading = travelBearing(path[i - 1], path[i]); }
  }
  return heading;
}
export function vehicleHeading(previous: (Point & { heading: number }) | undefined, next: Point & { heading?: number | null }, paths: Point[][]) {
  const movement = previous ? offset(previous, next) : null;
  const alongRoute = routeBearing(next, paths);
  // Small GPS jitter while stopped must not spin an ambulance on the spot.
  if (previous && movement && Math.hypot(movement.x, movement.y) < 3) return alongRoute !== null && Math.abs(headingDifference(previous.heading, alongRoute)) <= 60 ? alongRoute : previous.heading;
  const direction = previous ? travelBearing(previous, next) : typeof next.heading === "number" && Number.isFinite(next.heading) && next.heading >= 0 && next.heading <= 360 ? normalizeHeading(next.heading) : null;
  if (alongRoute !== null && (direction === null || Math.abs(headingDifference(direction, alongRoute)) <= 60)) return alongRoute;
  return direction ?? previous?.heading ?? 0;
}
