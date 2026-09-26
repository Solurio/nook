// Guides over the picture, and help keeping strokes on them: a grid, the
// rule of thirds, and one- or two-point perspective with vanishing points on
// a horizon. With the assist on, a stroke settles after its first few pixels
// on the guide line it is heading along, and stays on it.
//
// Guides are a drawing aid for whoever is drawing, kept on their own device;
// they never become part of the picture.

export type Pt = [number, number];

export interface Guides {
  /** Grid cell in picture pixels; 0 for none. */
  grid: number;
  thirds: boolean;
  /** How many vanishing points: none, one, or two. */
  perspective: 0 | 1 | 2;
  /** The vanishing points, in picture pixels. Both sit on one horizon. */
  vp: [Pt, Pt];
  /** Strokes lock to the guide lines. */
  assist: boolean;
  /** Holding still at the end of a stroke tidies it into a clean shape. */
  quickShape: boolean;
}

export function defaultGuides(w: number, h: number): Guides {
  return {
    grid: 0,
    thirds: false,
    perspective: 0,
    vp: [
      [w * 0.5, h * 0.42],
      [w * 1.08, h * 0.42],
    ],
    assist: false,
    quickShape: true,
  };
}

/** The vanishing points in use. With one point, it is the first. */
export function activePoints(g: Guides, w: number): Pt[] {
  if (g.perspective === 0) return [];
  if (g.perspective === 1) return [g.vp[0]];
  // Two points want to be apart; a first point left in the middle moves out to the left.
  const [a, b] = g.vp;
  return [a[0] > w * 0.35 && a[0] < w * 0.65 ? [-w * 0.08, a[1]] : a, b];
}

/** Moves a vanishing point. The horizon goes with it, taking the other point along. */
export function moveVanishing(g: Guides, index: 0 | 1, to: Pt, w: number): Guides {
  const pts = activePoints(g, w);
  const other = pts[index === 0 ? 1 : 0] ?? g.vp[index === 0 ? 1 : 0];
  const moved: Pt = [to[0], to[1]];
  const kept: Pt = [other[0], to[1]];
  return { ...g, vp: index === 0 ? [moved, kept] : [kept, moved] };
}

/** Every line to draw for the guides, as [x0, y0, x1, y1] in picture pixels, with how strong it is. */
export function guideLines(g: Guides, w: number, h: number): Array<{ line: [number, number, number, number]; strong: boolean }> {
  const out: Array<{ line: [number, number, number, number]; strong: boolean }> = [];
  if (g.grid > 0) {
    const step = Math.max(4, g.grid);
    for (let x = step; x < w; x += step) out.push({ line: [x, 0, x, h], strong: false });
    for (let y = step; y < h; y += step) out.push({ line: [0, y, w, y], strong: false });
  }
  if (g.thirds) {
    for (const f of [1 / 3, 2 / 3]) {
      out.push({ line: [w * f, 0, w * f, h], strong: true });
      out.push({ line: [0, h * f, w, h * f], strong: true });
    }
  }
  const pts = activePoints(g, w);
  if (pts.length) {
    const horizon = pts[0][1];
    out.push({ line: [Math.min(0, ...pts.map((p) => p[0])) - w, horizon, Math.max(w, ...pts.map((p) => p[0])) + w, horizon], strong: true });
    // Rays from each point to evenly spaced marks round the picture's edge.
    const marks: Pt[] = [];
    const n = 10;
    for (let i = 0; i <= n; i += 1) {
      marks.push([(w * i) / n, 0], [(w * i) / n, h]);
      marks.push([0, (h * i) / n], [w, (h * i) / n]);
    }
    for (const p of pts) {
      for (const m of marks) {
        // Carried on past the edge so the lines run off the picture, not stop on it.
        const dx = m[0] - p[0];
        const dy = m[1] - p[1];
        const len = Math.hypot(dx, dy) || 1;
        const far = Math.max(w, h) * 3;
        out.push({ line: [p[0], p[1], p[0] + (dx / len) * far, p[1] + (dy / len) * far], strong: false });
      }
    }
    if (pts.length === 2) for (let i = 1; i < 8; i += 1) out.push({ line: [(w * i) / 8, 0, (w * i) / 8, h], strong: false });
  }
  return out;
}

/**
 * Which way a stroke should run, starting at `origin` and heading `toward`:
 * the guide line closest in angle. Null when it has not gone far enough to tell.
 */
export function assistDirection(g: Guides, origin: Pt, toward: Pt, w: number): Pt | null {
  const dx = toward[0] - origin[0];
  const dy = toward[1] - origin[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const heading: Pt = [dx / len, dy / len];
  const pts = activePoints(g, w);
  const options: Pt[] = [[0, 1]];
  if (pts.length !== 2) options.push([1, 0]);
  if (pts.length === 0) {
    const d = Math.SQRT1_2;
    options.push([d, d], [d, -d]);
  }
  for (const p of pts) {
    const vx = p[0] - origin[0];
    const vy = p[1] - origin[1];
    const vl = Math.hypot(vx, vy);
    if (vl > 1e-6) options.push([vx / vl, vy / vl]);
  }
  let best = options[0];
  let score = -1;
  for (const o of options) {
    // Either way along the line counts.
    const s = Math.abs(o[0] * heading[0] + o[1] * heading[1]);
    if (s > score) {
      score = s;
      best = o;
    }
  }
  return best;
}

/** A point brought onto the line through `origin` along `dir`. */
export function onLine(origin: Pt, dir: Pt, p: Pt): Pt {
  const t = (p[0] - origin[0]) * dir[0] + (p[1] - origin[1]) * dir[1];
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t];
}

const KEY = (item: string) => `nook.studio.guides.${item}`;

export function readGuides(item: string, w: number, h: number): Guides {
  try {
    const raw = window.localStorage.getItem(KEY(item));
    if (raw) return { ...defaultGuides(w, h), ...(JSON.parse(raw) as Partial<Guides>) };
  } catch {
    // Nothing saved, or nothing we may read.
  }
  return defaultGuides(w, h);
}

export function saveGuides(item: string, g: Guides) {
  try {
    window.localStorage.setItem(KEY(item), JSON.stringify(g));
  } catch {
    // Remembered for this visit only.
  }
}
