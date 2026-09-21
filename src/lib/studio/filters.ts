// Filters that change the pixels of a layer, inside a selection or all over:
// blur, mosaic, noise, posterize, invert, greyscale -- and the liquify push.
// They work on raw RGBA so the same rules can be tested without a browser.
//
// Each takes the pixels of a region and, optionally, a mask the same size:
// where the mask is 0 nothing changes, where it is 255 the filter shows fully.

import { seeded } from "./rng";

export type FilterKind = "blur" | "mosaic" | "noise" | "posterize" | "invert" | "grayscale" | "sharpen";

export const FILTERS: Array<{ kind: FilterKind; name: string; min: number; max: number; start: number }> = [
  { kind: "blur", name: "blur", min: 1, max: 40, start: 6 },
  { kind: "sharpen", name: "sharpen", min: 1, max: 10, start: 3 },
  { kind: "mosaic", name: "mosaic", min: 2, max: 80, start: 12 },
  { kind: "noise", name: "noise", min: 1, max: 100, start: 25 },
  { kind: "posterize", name: "posterize", min: 2, max: 16, start: 4 },
  { kind: "invert", name: "invert", min: 0, max: 0, start: 0 },
  { kind: "grayscale", name: "greyscale", min: 0, max: 0, start: 0 },
];

type Pixels = Uint8ClampedArray;

/** Mixes the filtered pixels back into the original by the mask. */
function blendByMask(original: Pixels, filtered: Pixels, mask: Uint8Array | null) {
  if (!mask) {
    original.set(filtered);
    return;
  }
  for (let p = 0; p < mask.length; p += 1) {
    const k = mask[p];
    if (!k) continue;
    const i = p * 4;
    if (k === 255) {
      original[i] = filtered[i];
      original[i + 1] = filtered[i + 1];
      original[i + 2] = filtered[i + 2];
      original[i + 3] = filtered[i + 3];
    } else {
      const t = k / 255;
      for (let c = 0; c < 4; c += 1) original[i + c] = original[i + c] + (filtered[i + c] - original[i + c]) * t;
    }
  }
}

/** A box blur along one axis, weighting colour by alpha so edges do not go dark. */
function boxPass(src: Pixels, dst: Pixels, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  for (let line = 0; line < lines; line += 1) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sa = 0;
    let count = 0;
    const idx = (k: number) => (horizontal ? (line * w + k) * 4 : (k * w + line) * 4);
    for (let k = -r; k <= r; k += 1) {
      if (k < 0 || k >= len) continue;
      const i = idx(k);
      const a = src[i + 3];
      sr += src[i] * a;
      sg += src[i + 1] * a;
      sb += src[i + 2] * a;
      sa += a;
      count += 1;
    }
    for (let k = 0; k < len; k += 1) {
      const o = idx(k);
      dst[o] = sa ? sr / sa : 0;
      dst[o + 1] = sa ? sg / sa : 0;
      dst[o + 2] = sa ? sb / sa : 0;
      dst[o + 3] = count ? sa / count : 0;
      const out = k - r;
      const inn = k + r + 1;
      if (out >= 0) {
        const i = idx(out);
        const a = src[i + 3];
        sr -= src[i] * a;
        sg -= src[i + 1] * a;
        sb -= src[i + 2] * a;
        sa -= a;
        count -= 1;
      }
      if (inn < len) {
        const i = idx(inn);
        const a = src[i + 3];
        sr += src[i] * a;
        sg += src[i + 1] * a;
        sb += src[i + 2] * a;
        sa += a;
        count += 1;
      }
    }
  }
}

/** Three box blurs make a Gaussian, near enough. */
export function blurPixels(px: Pixels, w: number, h: number, radius: number): Pixels {
  const r = Math.max(1, Math.round(radius / 2));
  const a: Pixels = new Uint8ClampedArray(px);
  const b: Pixels = new Uint8ClampedArray(px.length);
  for (let pass = 0; pass < 3; pass += 1) {
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  return a;
  // (b is scratch; a holds the result after each pair of passes.)
}

export function applyFilter(px: Pixels, w: number, h: number, kind: FilterKind, amount: number, mask: Uint8Array | null, seed = "filter") {
  let out: Pixels;
  switch (kind) {
    case "blur":
      out = blurPixels(px, w, h, amount);
      break;
    case "sharpen": {
      const soft = blurPixels(px, w, h, 3);
      out = new Uint8ClampedArray(px.length);
      const k = amount / 3;
      for (let i = 0; i < px.length; i += 4) {
        for (let c = 0; c < 3; c += 1) out[i + c] = px[i + c] + (px[i + c] - soft[i + c]) * k;
        out[i + 3] = px[i + 3];
      }
      break;
    }
    case "mosaic": {
      out = new Uint8ClampedArray(px);
      const cell = Math.max(2, Math.round(amount));
      for (let y0 = 0; y0 < h; y0 += cell) {
        for (let x0 = 0; x0 < w; x0 += cell) {
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          let n = 0;
          for (let y = y0; y < Math.min(h, y0 + cell); y += 1) {
            for (let x = x0; x < Math.min(w, x0 + cell); x += 1) {
              const i = (y * w + x) * 4;
              const al = px[i + 3];
              r += px[i] * al;
              g += px[i + 1] * al;
              b += px[i + 2] * al;
              a += al;
              n += 1;
            }
          }
          for (let y = y0; y < Math.min(h, y0 + cell); y += 1) {
            for (let x = x0; x < Math.min(w, x0 + cell); x += 1) {
              const i = (y * w + x) * 4;
              out[i] = a ? r / a : 0;
              out[i + 1] = a ? g / a : 0;
              out[i + 2] = a ? b / a : 0;
              out[i + 3] = a / n;
            }
          }
        }
      }
      break;
    }
    case "noise": {
      out = new Uint8ClampedArray(px);
      const rand = seeded(seed);
      const k = amount * 1.28;
      for (let i = 0; i < px.length; i += 4) {
        const n = (rand() - 0.5) * k;
        out[i] = px[i] + n;
        out[i + 1] = px[i + 1] + n;
        out[i + 2] = px[i + 2] + n;
      }
      break;
    }
    case "posterize": {
      out = new Uint8ClampedArray(px);
      const levels = Math.max(2, Math.round(amount));
      const step = 255 / (levels - 1);
      for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c += 1) out[i + c] = Math.round(px[i + c] / step) * step;
      break;
    }
    case "invert":
      out = new Uint8ClampedArray(px);
      for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c += 1) out[i + c] = 255 - px[i + c];
      break;
    case "grayscale":
      out = new Uint8ClampedArray(px);
      for (let i = 0; i < px.length; i += 4) {
        const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        out[i] = l;
        out[i + 1] = l;
        out[i + 2] = l;
      }
      break;
  }
  blendByMask(px, out, mask);
}

/**
 * Liquify: pixels near the brush pushed along the way it moves, strongest in
 * the middle. Samples a copy, so each dab reads the picture as it was.
 */
export function pushPixels(px: Pixels, w: number, h: number, cx: number, cy: number, radius: number, dx: number, dy: number, strength: number) {
  const src = new Uint8ClampedArray(px);
  const r = Math.max(1, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  const sample = (x: number, y: number, c: number) => {
    const xi = Math.max(0, Math.min(w - 1, Math.floor(x)));
    const yi = Math.max(0, Math.min(h - 1, Math.floor(y)));
    const xj = Math.min(w - 1, xi + 1);
    const yj = Math.min(h - 1, yi + 1);
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const a = src[(yi * w + xi) * 4 + c];
    const b = src[(yi * w + xj) * 4 + c];
    const d = src[(yj * w + xi) * 4 + c];
    const e = src[(yj * w + xj) * 4 + c];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  };
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist >= r) continue;
      const k = (1 - dist / r) ** 2 * strength;
      const sx = x - dx * k;
      const sy = y - dy * k;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c += 1) px[i + c] = sample(sx, sy, c);
    }
  }
}
