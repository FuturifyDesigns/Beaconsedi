export type LabelBox = { id: string; x: number; y: number; width: number; height: number; priority: number; clearance?: number };
export type PlacedLabel = LabelBox & { markerX: number; markerY: number };
const overlap = (a: LabelBox, b: LabelBox) => Math.max(0, (a.width + b.width) / 2 + 6 - Math.abs(a.x - b.x))
  * Math.max(0, (a.height + b.height) / 2 + 6 - Math.abs(a.y - b.y));

/** Screen-space label layout. This is local drawing, with no provider requests. */
export function arrangeMapLabels(labels: LabelBox[], width: number, height: number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const label of [...labels].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    let best: PlacedLabel | null = null, bestScore = Infinity;
    const row = label.height + 12;
    const above = -Math.max(46, label.clearance ?? 46);
    for (const [dx, dy] of [[0, above], [0, above-row], [0, 40], [0, 40+row], [-label.width/2-22, above], [label.width/2+22, above], [0, above-2*row], [0, 40+2*row]]) {
      const candidate = { ...label, markerX: label.x, markerY: label.y,
        x: Math.max(label.width/2+6, Math.min(width-label.width/2-6, label.x+dx)),
        y: Math.max(label.height/2+6, Math.min(height-label.height/2-6, label.y+dy)) };
      const score = placed.reduce((sum, other) => sum + overlap(candidate, other), 0) * 1000
        + Math.hypot(candidate.x-label.x, candidate.y-label.y-above);
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    if (best) placed.push(best);
  }
  return placed;
}
