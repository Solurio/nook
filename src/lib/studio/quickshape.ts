// Holding still at the end of a stroke tidies it: a wobbly line becomes a
// straight one, a lopsided circle a true circle (or ellipse), a rough box or
// triangle a clean polygon, an open zigzag its straight segments. Anything
// that is none of those is left alone.
//
// Points come flat, [x0, y0, x1, y1, ...], in picture pixels. `scale` is the
// zoom, so "too small to bother" and "close enough" are judged on screen.

export type Snapped = { kind: "line" | "ellipse" | "polygon" | "polyline"; points: number[] };

type P = [number, number];

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Distance from a point to the segment a-b. */
function toSegment(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (!len) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

/** The corners that matter (Ramer-Douglas-Peucker), as indices into the points. */
export function corners(points: P[], eps: number): number[] {
  const keep = new Set<number>([0, points.length - 1]);
  const walk = (from: number, to: number) => {
    let far = -1;
    let most = 0;
    for (let i = from + 1; i < to; i += 1) {
      const d = toSegment(points[i], points[from], points[to]);
      if (d > most) {
        most = d;
        far = i;
      }
    }
    if (far >= 0 && most > eps) {
      keep.add(far);
      walk(from, far);
      walk(far, to);
    }
  };
  walk(0, points.length - 1);
  return [...keep].sort((a, b) => a - b);
}

/** How far the points stray, at most, from the polyline through the chosen ones. */
function stray(points: P[], picked: number[]): number {
  let worst = 0;
  for (let k = 0; k < picked.length - 1; k += 1) {
    for (let i = picked[k]; i <= picked[k + 1]; i += 1) worst = Math.max(worst, toSegment(points[i], points[picked[k]], points[picked[k + 1]]));
  }
  return worst;
}

export function snapShape(flat: number[], scale = 1): Snapped | null {
  const points: P[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
  if (points.length < 4) return null;

  let length = 0;
  for (let i = 1; i < points.length; i += 1) length += dist(points[i - 1], points[i]);
  if (length * scale < 24) return null;

  const start = points[0];
  const end = points[points.length - 1];
  const chord = dist(start, end);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const size = Math.max(w, h);
  const eps = Math.max(4 / scale, size * 0.07);

  // A line: barely longer than the straight way between its ends.
  if (chord / length > 0.9 && stray(points, [0, points.length - 1]) < Math.max(5 / scale, chord * 0.07)) {
    return { kind: "line", points: [start[0], start[1], end[0], end[1]] };
  }

  const closed = chord < size * 0.25;
  if (closed) {
    // How well an ellipse through the box fits: every point about one radius out.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.max(1e-6, w / 2);
    const ry = Math.max(1e-6, h / 2);
    let err = 0;
    for (const [x, y] of points) err += Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1);
    err /= points.length;
    const ellipse = (): Snapped => {
      // Nearly round is meant to be round.
      const round = Math.abs(rx - ry) / Math.max(rx, ry) < 0.14;
      const ax = round ? (rx + ry) / 2 : rx;
      const ay = round ? (rx + ry) / 2 : ry;
      const steps = 96;
      const out: number[] = [];
      // Starting where the stroke did, so the dabs' pattern begins in the same place.
      const a0 = Math.atan2((start[1] - cy) / ay, (start[0] - cx) / ax);
      for (let i = 0; i <= steps; i += 1) {
        const a = a0 + (i / steps) * Math.PI * 2;
        out.push(cx + Math.cos(a) * ax, cy + Math.sin(a) * ay);
      }
      return { kind: "ellipse", points: out };
    };
    if (err < 0.08) return ellipse();

    const loop: P[] = [...points.slice(0, -1), start];
    const picked = corners(loop, eps);
    const count = picked.length - 1;
    if (count >= 3 && count <= 6 && stray(loop, picked) <= eps * 1.4) {
      let poly = picked.slice(0, -1).map((i) => loop[i]);
      // A rough box standing square to the picture is a box.
      if (count === 4) {
        const upright = poly.every((p, i) => {
          const q = poly[(i + 1) % 4];
          const a = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2);
          return a < 0.2 || a > Math.PI / 2 - 0.2;
        });
        if (upright) poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      }
      const out: number[] = [];
      for (const [x, y] of [...poly, poly[0]]) out.push(x, y);
      return { kind: "polygon", points: out };
    }
    if (err < 0.2) return ellipse();
    return null;
  }

  // Open: a few straight pieces, an angle or a zigzag.
  const picked = corners(points, eps);
  if (picked.length >= 3 && picked.length <= 5 && stray(points, picked) <= eps * 1.2) {
    const out: number[] = [];
    for (const i of picked) out.push(points[i][0], points[i][1]);
    return { kind: "polyline", points: out };
  }
  return null;
}
