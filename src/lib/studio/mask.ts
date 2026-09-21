// Selections, as masks over the canvas: 255 inside, 0 outside. Made from a
// rectangle, an ellipse, a lasso, or the magic wand; combined, inverted,
// moved; and written down compactly so a wand selection can travel with the
// operation that made it and come out the same on every screen.

export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

export type Combine = "replace" | "add" | "subtract";

export const emptyMask = (w: number, h: number): Mask => ({ w, h, data: new Uint8Array(w * h) });

export function fullMask(w: number, h: number): Mask {
  const m = emptyMask(w, h);
  m.data.fill(255);
  return m;
}

const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

export function rectMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Mask {
  const m = emptyMask(w, h);
  const ax = clampInt(Math.min(x0, x1), 0, w);
  const bx = clampInt(Math.max(x0, x1), 0, w);
  const ay = clampInt(Math.min(y0, y1), 0, h);
  const by = clampInt(Math.max(y0, y1), 0, h);
  for (let y = ay; y < by; y += 1) m.data.fill(255, y * w + ax, y * w + bx);
  return m;
}

export function ellipseMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Mask {
  const m = emptyMask(w, h);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  if (rx < 0.5 || ry < 0.5) return m;
  const ay = clampInt(cy - ry, 0, h);
  const by = clampInt(cy + ry, 0, h);
  for (let y = ay; y < by; y += 1) {
    const dy = (y + 0.5 - cy) / ry;
    const span = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const a = clampInt(cx - span, 0, w);
    const b = clampInt(cx + span, 0, w);
    if (b > a) m.data.fill(255, y * w + a, y * w + b);
  }
  return m;
}

/** A lasso: the inside of a closed polygon, by the even-odd rule, a row at a time. */
export function polygonMask(w: number, h: number, points: number[]): Mask {
  const m = emptyMask(w, h);
  const n = Math.floor(points.length / 2);
  if (n < 3) return m;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    minY = Math.min(minY, points[i * 2 + 1]);
    maxY = Math.max(maxY, points[i * 2 + 1]);
  }
  const ay = clampInt(minY, 0, h);
  const by = clampInt(maxY, 0, h);
  const xs: number[] = [];
  for (let y = ay; y < by; y += 1) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < n; i += 1) {
      const x1 = points[i * 2];
      const y1 = points[i * 2 + 1];
      const x2 = points[((i + 1) % n) * 2];
      const y2 = points[((i + 1) % n) * 2 + 1];
      if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) xs.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = clampInt(xs[k], 0, w);
      const b = clampInt(xs[k + 1], 0, w);
      if (b > a) m.data.fill(255, y * w + a, y * w + b);
    }
  }
  return m;
}

/**
 * The magic wand: everything close enough in colour to the pixel pressed --
 * joined to it, or anywhere on the canvas.
 */
export function wandMask(px: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, tolerance: number, contiguous = true): Mask {
  const m = emptyMask(w, h);
  const x0 = clampInt(sx, 0, w - 1);
  const y0 = clampInt(sy, 0, h - 1);
  const s = (y0 * w + x0) * 4;
  const sr = px[s];
  const sg = px[s + 1];
  const sb = px[s + 2];
  const sa = px[s + 3];
  const limit = tolerance * tolerance * 4;
  const close = (p: number) => {
    const i = p * 4;
    const dr = px[i] - sr;
    const dg = px[i + 1] - sg;
    const db = px[i + 2] - sb;
    const da = px[i + 3] - sa;
    return dr * dr + dg * dg + db * db + da * da <= limit;
  };
  if (!contiguous) {
    for (let p = 0; p < w * h; p += 1) if (close(p)) m.data[p] = 255;
    return m;
  }
  const stack: number[] = [x0, y0];
  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (m.data[y * w + x]) continue;
    let left = x;
    while (left > 0 && !m.data[y * w + left - 1] && close(y * w + left - 1)) left -= 1;
    let right = x;
    while (right < w - 1 && !m.data[y * w + right + 1] && close(y * w + right + 1)) right += 1;
    for (let i = left; i <= right; i += 1) {
      m.data[y * w + i] = 255;
      if (y > 0 && !m.data[(y - 1) * w + i] && close((y - 1) * w + i)) stack.push(i, y - 1);
      if (y < h - 1 && !m.data[(y + 1) * w + i] && close((y + 1) * w + i)) stack.push(i, y + 1);
    }
  }
  return m;
}

export function invertMask(mask: Mask): Mask {
  const out = emptyMask(mask.w, mask.h);
  for (let i = 0; i < mask.data.length; i += 1) out.data[i] = 255 - mask.data[i];
  return out;
}

/** A new selection on top of the last: in place of it, added to it, or cut out of it. */
export function combine(prev: Mask | null, next: Mask, mode: Combine): Mask {
  if (mode === "replace" || !prev) return mode === "subtract" ? emptyMask(next.w, next.h) : next;
  const out = emptyMask(next.w, next.h);
  for (let i = 0; i < out.data.length; i += 1) {
    out.data[i] = mode === "add" ? Math.max(prev.data[i], next.data[i]) : Math.max(0, prev.data[i] - next.data[i]);
  }
  return out;
}

/** The smallest box around what is selected, or null when nothing is. */
export function maskBounds(mask: Mask): { x: number; y: number; w: number; h: number } | null {
  let x0 = mask.w;
  let y0 = mask.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.h; y += 1) {
    const row = y * mask.w;
    for (let x = 0; x < mask.w; x += 1) {
      if (mask.data[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export const isEmpty = (mask: Mask) => !mask.data.some((v) => v > 0);

/**
 * A mask moved, turned or scaled: [a, b, c, d, e, f] maps a point (x, y) to
 * (a x + c y + e, b x + d y + f), the same order a canvas uses.
 */
export function transformMask(mask: Mask, m: number[]): Mask {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  const out = emptyMask(mask.w, mask.h);
  if (Math.abs(det) < 1e-9) return out;
  // Inverse, to ask of every output pixel where it came from.
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  const ie = (c * f - d * e) / det;
  const iF = (b * e - a * f) / det;
  for (let y = 0; y < mask.h; y += 1) {
    for (let x = 0; x < mask.w; x += 1) {
      const sx = Math.floor(ia * (x + 0.5) + ic * (y + 0.5) + ie);
      const sy = Math.floor(ib * (x + 0.5) + id * (y + 0.5) + iF);
      if (sx >= 0 && sy >= 0 && sx < mask.w && sy < mask.h) out.data[y * mask.w + x] = mask.data[sy * mask.w + sx];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writing one down
// ---------------------------------------------------------------------------

/** Runs of in and out, as variable-length numbers in base64: a wand selection in a few hundred bytes. */
export function encodeMask(mask: Mask): string {
  const bytes: number[] = [];
  const put = (n: number) => {
    let v = n;
    while (v >= 0x80) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v);
  };
  let inside = false;
  let run = 0;
  for (let i = 0; i < mask.data.length; i += 1) {
    const now = mask.data[i] > 127;
    if (now === inside) run += 1;
    else {
      put(run);
      inside = now;
      run = 1;
    }
  }
  put(run);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function decodeMask(text: string, w: number, h: number): Mask {
  const m = emptyMask(w, h);
  let binary = "";
  try {
    binary = atob(text);
  } catch {
    return m;
  }
  let at = 0;
  let inside = false;
  let i = 0;
  while (i < binary.length && at < m.data.length) {
    let v = 0;
    let shift = 0;
    let b = 0;
    do {
      b = binary.charCodeAt(i);
      i += 1;
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80 && i < binary.length);
    if (inside) m.data.fill(255, at, Math.min(m.data.length, at + v));
    at += v;
    inside = !inside;
  }
  return m;
}

/**
 * The outline of a selection, as line segments [x0, y0, x1, y1, ...] along
 * the pixel edges between inside and outside, joined up where they run on.
 */
export function maskEdges(mask: Mask): number[] {
  const { w, h, data } = mask;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] >= 128;
  const out: number[] = [];
  // Edges along rows: between the pixel above and the one below.
  for (let y = 0; y <= h; y += 1) {
    let start = -1;
    for (let x = 0; x <= w; x += 1) {
      const edge = x < w && inside(x, y - 1) !== inside(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        out.push(start, y, x, y);
        start = -1;
      }
    }
  }
  // And along columns.
  for (let x = 0; x <= w; x += 1) {
    let start = -1;
    for (let y = 0; y <= h; y += 1) {
      const edge = y < h && inside(x - 1, y) !== inside(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) {
        out.push(x, start, x, y);
        start = -1;
      }
    }
  }
  return out;
}
