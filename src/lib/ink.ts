import type { InkDraft, Stroke } from "./types";

/** Strokes in the order they were drawn, oldest first. */
export function orderStrokes(strokes: Record<string, Stroke>): Stroke[] {
  return Object.values(strokes).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Builds an SVG path from a flat [x0,y0,x1,y1,...] point list. */
export function inkPath(points: number[]): string {
  if (points.length < 2) return "";
  let d = `M ${round(points[0])} ${round(points[1])}`;
  if (points.length === 2) {
    // A single tap: nudge so the round cap still paints a dot.
    d += ` L ${round(points[0] + 0.01)} ${round(points[1])}`;
    return d;
  }
  for (let i = 2; i < points.length; i += 2) {
    d += ` L ${round(points[i])} ${round(points[i + 1])}`;
  }
  return d;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  // Degenerate segment: fall back to point distance.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Whether a point comes within `radius` of any segment of a stroke. Used by the
 * eraser: touching a line anywhere rubs the whole line out.
 */
export function strokeHit(
  stroke: Stroke | InkDraft,
  x: number,
  y: number,
  radius: number,
): boolean {
  const pts = stroke.points;
  const reach = radius + stroke.size / 2;

  if (pts.length === 2) {
    return Math.hypot(x - pts[0], y - pts[1]) <= reach;
  }

  for (let i = 0; i + 3 < pts.length; i += 2) {
    if (distanceToSegment(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= reach) {
      return true;
    }
  }
  return false;
}
