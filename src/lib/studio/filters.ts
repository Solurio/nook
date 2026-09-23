// Filters that change the pixels of a layer, inside a selection or all over:
// colour adjustments (brightness, contrast, levels, hue and saturation, a
// gradient map...), blurs, and effects -- and the liquify push. They work on
// raw RGBA so the same rules can be tested without a browser.
//
// Each takes the pixels of a region and, optionally, a mask the same size:
// where the mask is 0 nothing changes, where it is 255 the filter shows fully.

import { seeded } from "./rng";

export type FilterKind =
  | "blur"
  | "motion"
  | "sharpen"
  | "mosaic"
  | "noise"
  | "posterize"
  | "invert"
  | "grayscale"
  | "brightness"
  | "hsl"
  | "levels"
  | "gradientmap"
  | "temperature"
  | "threshold"
  | "sepia"
  | "glow"
  | "chromatic"
  | "vignette"
  | "emboss"
  | "lineart"
  | "halftone"
  | "outline";

export type FilterParams = Record<string, number | string>;

export type FilterParam =
  | { key: string; name: string; min: number; max: number; start: number; step?: number }
  | { key: string; name: string; color: true; start: string };

export interface FilterInfo {
  kind: FilterKind;
  name: string;
  group: "adjust" | "blur" | "effect";
  /** The first is the op's amount; the rest go in its params. */
  params: FilterParam[];
}

const n = (key: string, name: string, min: number, max: number, start: number, step?: number): FilterParam => ({ key, name, min, max, start, step });
const c = (key: string, name: string, start: string): FilterParam => ({ key, name, color: true, start });

export const FILTERS: FilterInfo[] = [
  { kind: "brightness", name: "brightness and contrast", group: "adjust", params: [n("amount", "brightness", -100, 100, 0), n("contrast", "contrast", -100, 100, 0)] },
  { kind: "hsl", name: "hue and saturation", group: "adjust", params: [n("amount", "hue", -180, 180, 0), n("saturation", "saturation", -100, 100, 0), n("lightness", "lightness", -100, 100, 0)] },
  { kind: "levels", name: "levels", group: "adjust", params: [n("amount", "black point", 0, 250, 0), n("white", "white point", 5, 255, 255), n("gamma", "midtones", 10, 300, 100)] },
  { kind: "gradientmap", name: "gradient map", group: "adjust", params: [n("amount", "strength", 0, 100, 100), c("from", "shadows", "#1b1030"), c("mid", "midtones", "#c2507a"), c("to", "highlights", "#ffe3a8")] },
  { kind: "temperature", name: "temperature", group: "adjust", params: [n("amount", "warmth", -100, 100, 25), n("tint", "tint", -100, 100, 0)] },
  { kind: "posterize", name: "posterize", group: "adjust", params: [n("amount", "levels", 2, 16, 4)] },
  { kind: "threshold", name: "threshold", group: "adjust", params: [n("amount", "level", 1, 254, 128)] },
  { kind: "grayscale", name: "greyscale", group: "adjust", params: [] },
  { kind: "sepia", name: "sepia", group: "adjust", params: [n("amount", "strength", 0, 100, 80)] },
  { kind: "invert", name: "invert", group: "adjust", params: [] },
  { kind: "blur", name: "blur", group: "blur", params: [n("amount", "radius", 1, 60, 6)] },
  { kind: "motion", name: "motion blur", group: "blur", params: [n("amount", "distance", 1, 120, 20), n("angle", "angle", -180, 180, 0)] },
  { kind: "sharpen", name: "sharpen", group: "blur", params: [n("amount", "strength", 1, 10, 3)] },
  { kind: "glow", name: "glow", group: "blur", params: [n("amount", "radius", 2, 60, 14), n("strength", "strength", 0, 100, 60)] },
  { kind: "mosaic", name: "mosaic", group: "effect", params: [n("amount", "cell", 2, 80, 12)] },
  { kind: "noise", name: "noise", group: "effect", params: [n("amount", "amount", 1, 100, 25)] },
  { kind: "chromatic", name: "chromatic aberration", group: "effect", params: [n("amount", "shift", 1, 40, 6)] },
  { kind: "vignette", name: "vignette", group: "effect", params: [n("amount", "strength", 0, 100, 50), n("size", "size", 10, 100, 60)] },
  { kind: "emboss", name: "emboss", group: "effect", params: [n("amount", "strength", 1, 10, 3)] },
  { kind: "halftone", name: "halftone", group: "effect", params: [n("amount", "dot size", 3, 40, 8)] },
  { kind: "outline", name: "outline", group: "effect", params: [n("amount", "width", 1, 20, 3), c("color", "colour", "#1a1420")] },
  { kind: "lineart", name: "line extraction", group: "effect", params: [n("amount", "keep", 0, 100, 60)] },
];

export const filterInfo = (kind: FilterKind) => FILTERS.find((f) => f.kind === kind) ?? FILTERS[0];

/** Every setting of a filter, from its op: what it was given, else where the setting starts. */
export function filterSettings(kind: FilterKind, amount: number, params: FilterParams | undefined): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of filterInfo(kind).params) {
    const given = p.key === "amount" ? amount : params?.[p.key];
    if ("color" in p) out[p.key] = typeof given === "string" && /^#[0-9a-f]{6}$/i.test(given) ? given : p.start;
    else out[p.key] = typeof given === "number" && Number.isFinite(given) ? Math.max(p.min, Math.min(p.max, given)) : p.start;
  }
  return out;
}

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
      for (let ch = 0; ch < 4; ch += 1) original[i + ch] = original[i + ch] + (filtered[i + ch] - original[i + ch]) * t;
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
}

const hex = (s: string): [number, number, number] => {
  const v = /^#?([0-9a-f]{6})$/i.exec(s)?.[1] ?? "000000";
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

const luma = (r: number, g: number, b: number) => r * 0.299 + g * 0.587 + b * 0.114;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** A pixel read from a spot that may be off the edge: the nearest one on it. */
const at = (px: Pixels, w: number, h: number, x: number, y: number, ch: number) => px[((Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4) + ch];

export function applyFilter(px: Pixels, w: number, h: number, kind: FilterKind, amount: number, mask: Uint8Array | null, seed = "filter", params?: FilterParams) {
  const s = filterSettings(kind, amount, params);
  const num = (key: string) => Number(s[key]);
  let out: Pixels;
  switch (kind) {
    case "blur":
      out = blurPixels(px, w, h, num("amount"));
      break;
    case "motion": {
      // Averaged along a line through each pixel, the way a moving camera smears it.
      out = new Uint8ClampedArray(px.length);
      const dist = Math.max(1, Math.round(num("amount")));
      const a = (num("angle") * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const steps = Math.min(dist, 60);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          let r = 0;
          let g = 0;
          let b = 0;
          let al = 0;
          for (let k = 0; k <= steps; k += 1) {
            const t = (k / steps - 0.5) * dist;
            const sx = Math.round(x + dx * t);
            const sy = Math.round(y + dy * t);
            const aa = at(px, w, h, sx, sy, 3);
            r += at(px, w, h, sx, sy, 0) * aa;
            g += at(px, w, h, sx, sy, 1) * aa;
            b += at(px, w, h, sx, sy, 2) * aa;
            al += aa;
          }
          const i = (y * w + x) * 4;
          out[i] = al ? r / al : 0;
          out[i + 1] = al ? g / al : 0;
          out[i + 2] = al ? b / al : 0;
          out[i + 3] = al / (steps + 1);
        }
      }
      break;
    }
    case "sharpen": {
      const soft = blurPixels(px, w, h, 3);
      out = new Uint8ClampedArray(px.length);
      const k = num("amount") / 3;
      for (let i = 0; i < px.length; i += 4) {
        for (let ch = 0; ch < 3; ch += 1) out[i + ch] = px[i + ch] + (px[i + ch] - soft[i + ch]) * k;
        out[i + 3] = px[i + 3];
      }
      break;
    }
    case "glow": {
      // A blurred copy of the light parts, laid over with screen.
      const soft = blurPixels(px, w, h, num("amount"));
      const k = num("strength") / 100;
      out = new Uint8ClampedArray(px);
      for (let i = 0; i < px.length; i += 4) {
        const a = soft[i + 3] / 255;
        for (let ch = 0; ch < 3; ch += 1) {
          const base = px[i + ch];
          const light = soft[i + ch] * a * k;
          out[i + ch] = 255 - ((255 - base) * (255 - light)) / 255;
        }
        out[i + 3] = Math.max(px[i + 3], soft[i + 3] * k);
      }
      break;
    }
    case "mosaic": {
      out = new Uint8ClampedArray(px);
      const cell = Math.max(2, Math.round(num("amount")));
      for (let y0 = 0; y0 < h; y0 += cell) {
        for (let x0 = 0; x0 < w; x0 += cell) {
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          let count = 0;
          for (let y = y0; y < Math.min(h, y0 + cell); y += 1) {
            for (let x = x0; x < Math.min(w, x0 + cell); x += 1) {
              const i = (y * w + x) * 4;
              const al = px[i + 3];
              r += px[i] * al;
              g += px[i + 1] * al;
              b += px[i + 2] * al;
              a += al;
              count += 1;
            }
          }
          for (let y = y0; y < Math.min(h, y0 + cell); y += 1) {
            for (let x = x0; x < Math.min(w, x0 + cell); x += 1) {
              const i = (y * w + x) * 4;
              out[i] = a ? r / a : 0;
              out[i + 1] = a ? g / a : 0;
              out[i + 2] = a ? b / a : 0;
              out[i + 3] = a / count;
            }
          }
        }
      }
      break;
    }
    case "noise": {
      out = new Uint8ClampedArray(px);
      const rand = seeded(seed);
      const k = num("amount") * 1.28;
      for (let i = 0; i < px.length; i += 4) {
        const v = (rand() - 0.5) * k;
        out[i] = px[i] + v;
        out[i + 1] = px[i + 1] + v;
        out[i + 2] = px[i + 2] + v;
      }
      break;
    }
    case "posterize": {
      out = new Uint8ClampedArray(px);
      const levels = Math.max(2, Math.round(num("amount")));
      const step = 255 / (levels - 1);
      for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch += 1) out[i + ch] = Math.round(px[i + ch] / step) * step;
      break;
    }
    case "invert":
      out = new Uint8ClampedArray(px);
      for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch += 1) out[i + ch] = 255 - px[i + ch];
      break;
    case "grayscale":
      out = new Uint8ClampedArray(px);
      for (let i = 0; i < px.length; i += 4) {
        const l = luma(px[i], px[i + 1], px[i + 2]);
        out[i] = l;
        out[i + 1] = l;
        out[i + 2] = l;
      }
      break;
    case "sepia": {
      out = new Uint8ClampedArray(px);
      const k = num("amount") / 100;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        out[i] = r + (r * 0.393 + g * 0.769 + b * 0.189 - r) * k;
        out[i + 1] = g + (r * 0.349 + g * 0.686 + b * 0.168 - g) * k;
        out[i + 2] = b + (r * 0.272 + g * 0.534 + b * 0.131 - b) * k;
      }
      break;
    }
    case "brightness": {
      out = new Uint8ClampedArray(px);
      const bright = num("amount") * 1.28;
      const con = num("contrast");
      // The usual contrast curve: 0 leaves it, 100 all but doubles it, -100 greys it out.
      const f = (259 * (con * 1.275 + 255)) / (255 * (259 - con * 1.275));
      for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch += 1) out[i + ch] = f * (px[i + ch] + bright - 128) + 128;
      break;
    }
    case "hsl": {
      out = new Uint8ClampedArray(px);
      const dh = num("amount") / 360;
      const ds = num("saturation") / 100;
      const dl = num("lightness") / 100;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        let [hh, ss, ll] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
        hh = (hh + dh + 1) % 1;
        ss = ds >= 0 ? ss + (1 - ss) * ds : ss * (1 + ds);
        ll = dl >= 0 ? ll + (1 - ll) * dl : ll * (1 + dl);
        const [r, g, b] = hslToRgb(hh, Math.max(0, Math.min(1, ss)), Math.max(0, Math.min(1, ll)));
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
      break;
    }
    case "levels": {
      out = new Uint8ClampedArray(px);
      const lo = num("amount");
      const hi = Math.max(lo + 1, num("white"));
      const gamma = num("gamma") / 100;
      const table = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v += 1) table[v] = 255 * Math.pow(Math.max(0, Math.min(1, (v - lo) / (hi - lo))), 1 / gamma);
      for (let i = 0; i < px.length; i += 4) for (let ch = 0; ch < 3; ch += 1) out[i + ch] = table[px[i + ch]];
      break;
    }
    case "gradientmap": {
      // Every pixel's lightness picks its colour off a gradient from the shadows to the highlights.
      out = new Uint8ClampedArray(px);
      const stops = [hex(String(s.from)), hex(String(s.mid)), hex(String(s.to))];
      const k = num("amount") / 100;
      const map = new Uint8ClampedArray(256 * 3);
      for (let v = 0; v < 256; v += 1) {
        const t = v / 255;
        const [a, b, f] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - 0.5) * 2];
        for (let ch = 0; ch < 3; ch += 1) map[v * 3 + ch] = a[ch] + (b[ch] - a[ch]) * f;
      }
      for (let i = 0; i < px.length; i += 4) {
        const l = Math.round(luma(px[i], px[i + 1], px[i + 2]));
        for (let ch = 0; ch < 3; ch += 1) out[i + ch] = px[i + ch] + (map[l * 3 + ch] - px[i + ch]) * k;
      }
      break;
    }
    case "temperature": {
      out = new Uint8ClampedArray(px);
      const warm = num("amount") * 0.6;
      const tintBy = num("tint") * 0.5;
      for (let i = 0; i < px.length; i += 4) {
        out[i] = px[i] + warm;
        out[i + 1] = px[i + 1] + tintBy;
        out[i + 2] = px[i + 2] - warm;
      }
      break;
    }
    case "threshold": {
      out = new Uint8ClampedArray(px);
      const level = num("amount");
      for (let i = 0; i < px.length; i += 4) {
        const v = luma(px[i], px[i + 1], px[i + 2]) >= level ? 255 : 0;
        out[i] = v;
        out[i + 1] = v;
        out[i + 2] = v;
      }
      break;
    }
    case "chromatic": {
      // Red one way, blue the other, like a cheap lens.
      out = new Uint8ClampedArray(px);
      const d = Math.round(num("amount"));
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          out[i] = at(px, w, h, x - d, y, 0);
          out[i + 2] = at(px, w, h, x + d, y, 2);
          out[i + 3] = Math.max(px[i + 3], at(px, w, h, x - d, y, 3), at(px, w, h, x + d, y, 3));
        }
      }
      break;
    }
    case "vignette": {
      out = new Uint8ClampedArray(px);
      const k = num("amount") / 100;
      const size = num("size") / 100;
      const cx = w / 2;
      const cy = h / 2;
      const far = Math.hypot(cx, cy) || 1;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const d = Math.hypot(x - cx, y - cy) / far;
          const dark = d <= size ? 0 : Math.min(1, (d - size) / Math.max(0.01, 1 - size)) ** 2 * k;
          const i = (y * w + x) * 4;
          for (let ch = 0; ch < 3; ch += 1) out[i + ch] = px[i + ch] * (1 - dark);
        }
      }
      break;
    }
    case "emboss": {
      out = new Uint8ClampedArray(px);
      const k = num("amount");
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          for (let ch = 0; ch < 3; ch += 1) out[i + ch] = 128 + (at(px, w, h, x + 1, y + 1, ch) - at(px, w, h, x - 1, y - 1, ch)) * k;
        }
      }
      break;
    }
    case "halftone": {
      // Round dots on a grid, as big as the darkness under them: newsprint, or screentone.
      out = new Uint8ClampedArray(px.length);
      const cell = Math.max(3, Math.round(num("amount")));
      for (let y0 = 0; y0 < h; y0 += cell) {
        for (let x0 = 0; x0 < w; x0 += cell) {
          let dark = 0;
          let a = 0;
          let r = 0;
          let g = 0;
          let b = 0;
          let count = 0;
          for (let y = y0; y < Math.min(h, y0 + cell); y += 1) {
            for (let x = x0; x < Math.min(w, x0 + cell); x += 1) {
              const i = (y * w + x) * 4;
              const al = px[i + 3] / 255;
              dark += (1 - luma(px[i], px[i + 1], px[i + 2]) / 255) * al;
              a += al;
              r += px[i] * al;
              g += px[i + 1] * al;
              b += px[i + 2] * al;
              count += 1;
            }
          }
          if (!a) continue;
          const radius = Math.sqrt(dark / count) * cell * 0.72;
          const mx = x0 + cell / 2;
          const my = y0 + cell / 2;
          for (let y = y0; y < Math.min(h, y0 + cell); y += 1) {
            for (let x = x0; x < Math.min(w, x0 + cell); x += 1) {
              const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my);
              const i = (y * w + x) * 4;
              const cover = Math.max(0, Math.min(1, radius - d + 0.5));
              // Dots take the darkest of the cell's colours; paper shows between them.
              out[i] = (r / a) * 0.35;
              out[i + 1] = (g / a) * 0.35;
              out[i + 2] = (b / a) * 0.35;
              out[i + 3] = cover * 255;
            }
          }
        }
      }
      break;
    }
    case "outline": {
      // A band of colour round everything painted, grown out from its edge.
      const width = Math.max(1, Math.round(num("amount")));
      const [or, og, ob] = hex(String(s.color));
      out = new Uint8ClampedArray(px);
      const alpha = new Uint8Array(w * h);
      for (let p = 0; p < w * h; p += 1) alpha[p] = px[p * 4 + 3];
      const grown = dilate(alpha, w, h, width);
      for (let p = 0; p < w * h; p += 1) {
        const i = p * 4;
        const a = px[i + 3] / 255;
        const band = grown[p] / 255;
        if (band <= 0) continue;
        // The outline goes under the paint.
        const outA = a + band * (1 - a);
        out[i] = (px[i] * a + or * band * (1 - a)) / (outA || 1);
        out[i + 1] = (px[i + 1] * a + og * band * (1 - a)) / (outA || 1);
        out[i + 2] = (px[i + 2] * a + ob * band * (1 - a)) / (outA || 1);
        out[i + 3] = outA * 255;
      }
      break;
    }
    case "lineart": {
      // Paper turns see-through and the lines stay: a scanned sketch, ready to colour under.
      out = new Uint8ClampedArray(px);
      const keep = num("amount") / 100;
      const white = 255 - keep * 200;
      for (let i = 0; i < px.length; i += 4) {
        const l = luma(px[i], px[i + 1], px[i + 2]);
        const ink = Math.max(0, Math.min(1, (white - l) / Math.max(1, white)));
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        // Keep the line's own colour where it has one.
        const sat = Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
        if (sat > 40) {
          out[i] = px[i];
          out[i + 1] = px[i + 1];
          out[i + 2] = px[i + 2];
        }
        out[i + 3] = px[i + 3] * Math.sqrt(ink);
      }
      break;
    }
    default:
      out = new Uint8ClampedArray(px);
  }
  blendByMask(px, out, mask);
}

/** An alpha channel grown by some pixels, soft at its new edge. */
function dilate(alpha: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const row = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let m = 0;
      for (let k = -r; k <= r && m < 255; k += 1) {
        const xx = x + k;
        if (xx >= 0 && xx < w && alpha[y * w + xx] > m) m = alpha[y * w + xx];
      }
      row[y * w + x] = m;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let m = 0;
      for (let k = -r; k <= r && m < 255; k += 1) {
        const yy = y + k;
        if (yy >= 0 && yy < h && row[yy * w + x] > m) m = row[yy * w + x];
      }
      out[y * w + x] = m;
    }
  }
  return out;
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
  const sample = (x: number, y: number, ch: number) => {
    const xi = Math.max(0, Math.min(w - 1, Math.floor(x)));
    const yi = Math.max(0, Math.min(h - 1, Math.floor(y)));
    const xj = Math.min(w - 1, xi + 1);
    const yj = Math.min(h - 1, yi + 1);
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const a = src[(yi * w + xi) * 4 + ch];
    const b = src[(yi * w + xj) * 4 + ch];
    const d = src[(yj * w + xi) * 4 + ch];
    const e = src[(yj * w + xj) * 4 + ch];
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
      for (let ch = 0; ch < 4; ch += 1) px[i + ch] = sample(sx, sy, ch);
    }
  }
}
