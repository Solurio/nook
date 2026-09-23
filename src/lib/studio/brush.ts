// Brushes. A brush is a set of numbers -- how big, how hard its edge, how far
// apart its dabs, how much each dab wanders -- and a tip. A stroke carries a
// copy of the brush it was made with, so changing a brush later never changes
// what was already drawn, and every screen draws it the same.

import { seeded } from "./rng";

/**
 * The shape each dab is stamped with. "image" stamps a picture (one of
 * several, when the brush has variants); "roller" lays one picture along the
 * stroke without a break, like tape off a roll.
 */
export type Tip = "round" | "square" | "flat" | "grain" | "spray" | "image" | "roller";

/** What a stroke does to the layer. */
export type BrushMode = "paint" | "erase" | "smudge" | "blur" | "liquify";

/** How a stroke's paint lands on what is already there. */
export type BrushBlend = "normal" | "multiply" | "add" | "screen" | "overlay" | "darken" | "lighten" | "burn" | "dodge";

export interface BrushSpec {
  id: string;
  name: string;
  tip: Tip;
  mode: BrushMode;
  /** Diameter, in canvas pixels. */
  size: number;
  /** The most the whole stroke can cover, 0..1. */
  opacity: number;
  /** How much each dab lays down, 0..1. */
  flow: number;
  /** 1 is a hard edge, 0 fades from the middle. */
  hardness: number;
  /** Gap between dabs, as a share of the size. */
  spacing: number;
  /** How much each dab's size, opacity and place wander, 0..1. */
  jitterSize: number;
  jitterOpacity: number;
  scatter: number;
  /** Degrees the tip is turned, and how much that wanders. */
  angle: number;
  jitterAngle: number;
  /** 1 is round; less squashes the tip into an ellipse. */
  roundness: number;
  /** The tip turns with the stroke. */
  follow: boolean;
  /** Thin at the start and the end: 0.5 is six brush widths. */
  taperIn: number;
  taperOut: number;
  /** Holes in the dab, like pencil on paper, 0..1. */
  grain: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  /** Smudge, blur and liquify: how strongly, 0..1. */
  strength: number;
  /** Picture tips: where the pictures are. Several are variants, one picked at random per dab. */
  images?: string[];
  /** Picture tips keep their own colours instead of taking the brush's. */
  colorful?: boolean;
  /** How the stroke lands. */
  blend?: BrushBlend;
  /** How thin the lightest touch still draws, as a share of the size, when pressure sets the size. */
  pressureMin?: number;
  /** Dabs put down at each step, spread by the scatter: a spray of particles. */
  count?: number;
  /** How much of the colour already on the layer each dab picks up, 0..1, like wet paint. */
  mix?: number;
  /** Which set it came from, for grouping in the list. */
  source?: string;
}

const base: Omit<BrushSpec, "id" | "name"> = {
  tip: "round",
  mode: "paint",
  size: 12,
  opacity: 1,
  flow: 1,
  hardness: 0.9,
  spacing: 0.12,
  jitterSize: 0,
  jitterOpacity: 0,
  scatter: 0,
  angle: 0,
  jitterAngle: 0,
  roundness: 1,
  follow: false,
  taperIn: 0,
  taperOut: 0,
  grain: 0,
  pressureSize: true,
  pressureOpacity: false,
  strength: 0.5,
};

const brush = (id: string, name: string, patch: Partial<BrushSpec>): BrushSpec => ({ ...base, id, name, ...patch });

/** The brushes that come with the studio. */
export const BUILT_IN_BRUSHES: BrushSpec[] = [
  brush("pen", "pen", { size: 8, hardness: 1, spacing: 0.08 }),
  brush("ink", "ink pen", { size: 10, hardness: 1, spacing: 0.06, taperIn: 0.15, taperOut: 0.25, pressureMin: 0.1 }),
  brush("gpen", "g-pen", { size: 12, hardness: 1, spacing: 0.05, taperIn: 0.1, taperOut: 0.1, pressureMin: 0.02 }),
  brush("calligraphy", "calligraphy", { tip: "flat", size: 18, hardness: 1, spacing: 0.04, roundness: 0.22, angle: 40 }),
  brush("pencil", "pencil", { tip: "grain", size: 5, hardness: 0.8, flow: 0.7, spacing: 0.1, grain: 0.55, pressureOpacity: true }),
  brush("crayon", "crayon", { tip: "grain", size: 16, hardness: 0.7, flow: 0.8, spacing: 0.12, grain: 0.7, jitterAngle: 180 }),
  brush("marker", "marker", { size: 20, hardness: 0.6, opacity: 0.75, flow: 0.9, spacing: 0.08 }),
  brush("felt", "felt tip", { tip: "square", size: 14, hardness: 0.9, opacity: 0.85, spacing: 0.06, follow: true, roundness: 0.5 }),
  brush("airbrush", "airbrush", { size: 60, hardness: 0, flow: 0.08, spacing: 0.1, pressureSize: false, pressureOpacity: true }),
  brush("soft", "soft round", { size: 40, hardness: 0.15, flow: 0.35, spacing: 0.1 }),
  brush("watercolor", "watercolour", { size: 36, hardness: 0.3, opacity: 0.45, flow: 0.3, spacing: 0.12, jitterSize: 0.2, grain: 0.25, jitterAngle: 180 }),
  brush("wet", "wet mix", { size: 30, hardness: 0.4, opacity: 0.9, flow: 0.5, spacing: 0.08, mix: 0.55 }),
  brush("oil", "oil paint", { tip: "flat", size: 26, hardness: 0.8, flow: 0.8, spacing: 0.05, roundness: 0.45, follow: true, mix: 0.35, grain: 0.15 }),
  brush("spray", "spray can", { tip: "spray", size: 50, hardness: 1, flow: 0.9, spacing: 0.25, scatter: 0.1, pressureSize: false }),
  brush("glow", "glow", { size: 40, hardness: 0, flow: 0.25, spacing: 0.1, blend: "add" }),
  brush("pixel", "pixel", { tip: "square", size: 4, hardness: 1, spacing: 0.5, pressureSize: false }),
  brush("dots", "dotted", { size: 8, hardness: 1, spacing: 2 }),
  brush("hatch", "hatching", { tip: "flat", size: 22, hardness: 1, spacing: 0.9, roundness: 0.06, angle: 45, jitterAngle: 8 }),
  brush("eraser", "hard eraser", { mode: "erase", size: 24, hardness: 1 }),
  brush("soft-eraser", "soft eraser", { mode: "erase", size: 50, hardness: 0.1, flow: 0.4 }),
  brush("smudge", "smudge", { mode: "smudge", size: 36, hardness: 0.3, spacing: 0.1, strength: 0.65, pressureSize: false }),
  brush("blur", "blur", { mode: "blur", size: 40, hardness: 0.3, spacing: 0.2, strength: 0.6, pressureSize: false }),
  brush("liquify", "liquify", { mode: "liquify", size: 80, hardness: 0.5, spacing: 0.08, strength: 0.7, pressureSize: false }),
];

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};

const TIPS: Tip[] = ["round", "square", "flat", "grain", "spray", "image", "roller"];
const MODES: BrushMode[] = ["paint", "erase", "smudge", "blur", "liquify"];
const BLENDS: BrushBlend[] = ["normal", "multiply", "add", "screen", "overlay", "darken", "lighten", "burn", "dodge"];

/** The canvas's name for how a stroke lands. */
export const COMPOSITE: Record<BrushBlend, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  add: "lighter",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  burn: "color-burn",
  dodge: "color-dodge",
};

/** Picture addresses a brush may use: its own site's, or a picture carried inside it. */
const imageUrl = (u: unknown) => typeof u === "string" && u.length < 2000 && /^(https?:\/\/|data:image\/png;base64,|\/)/.test(u);

/** A brush as saved or sent, with every number in range. */
export function tidyBrush(raw: Partial<BrushSpec> | undefined): BrushSpec {
  const r = { ...base, ...(raw ?? {}) };
  const images = Array.isArray(r.images) ? r.images.filter(imageUrl).slice(0, 12) : [];
  const tip = TIPS.includes(r.tip) ? r.tip : "round";
  const out: BrushSpec = {
    id: String(r.id ?? "custom").slice(0, 60),
    name: String(r.name ?? "brush").slice(0, 40),
    // A picture tip with no picture falls back to a round one.
    tip: (tip === "image" || tip === "roller") && !images.length ? "round" : tip,
    mode: MODES.includes(r.mode) ? r.mode : "paint",
    size: clamp(r.size, 1, 1000, 12),
    opacity: clamp(r.opacity, 0.01, 1, 1),
    flow: clamp(r.flow, 0.01, 1, 1),
    hardness: clamp(r.hardness, 0, 1, 0.9),
    spacing: clamp(r.spacing, 0.02, 4, 0.12),
    jitterSize: clamp(r.jitterSize, 0, 1, 0),
    jitterOpacity: clamp(r.jitterOpacity, 0, 1, 0),
    scatter: clamp(r.scatter, 0, 3, 0),
    angle: clamp(r.angle, -360, 360, 0),
    jitterAngle: clamp(r.jitterAngle, 0, 180, 0),
    roundness: clamp(r.roundness, 0.03, 1, 1),
    follow: Boolean(r.follow),
    taperIn: clamp(r.taperIn, 0, 0.5, 0),
    taperOut: clamp(r.taperOut, 0, 0.5, 0),
    grain: clamp(r.grain, 0, 1, 0),
    pressureSize: r.pressureSize !== false,
    pressureOpacity: Boolean(r.pressureOpacity),
    strength: clamp(r.strength, 0.01, 1, 0.5),
  };
  // The newer settings only appear when they do something, so older brushes
  // and the strokes that carry them stay exactly as they were.
  if (images.length && (out.tip === "image" || out.tip === "roller")) out.images = images;
  if (r.colorful && out.images) out.colorful = true;
  if (r.blend && r.blend !== "normal" && BLENDS.includes(r.blend)) out.blend = r.blend;
  if (r.pressureMin) out.pressureMin = clamp(r.pressureMin, 0, 1, 0);
  if (r.count && Number(r.count) > 1) out.count = Math.round(clamp(r.count, 1, 24, 1));
  if (r.mix) out.mix = clamp(r.mix, 0, 1, 0);
  if (r.source) out.source = String(r.source).slice(0, 40);
  return out;
}

export interface Dab {
  x: number;
  y: number;
  /** Diameter. */
  size: number;
  /** 0..1, for this dab. */
  alpha: number;
  /** Radians. */
  angle: number;
  /** Which way the stroke is heading here, for liquify and smudge. */
  dx: number;
  dy: number;
  /** How far along the stroke it is, for a roller's picture. */
  at: number;
  /** Which of the brush's pictures, when it has several. */
  variant: number;
}

/** How long the thin ends of a stroke are, in canvas pixels, before a short stroke shares them out. */
export const taperLength = (share: number, size: number) => share * size * 12;

/**
 * Where a stroke's dabs go: evenly along the path at the brush's spacing,
 * sized by pressure and taper, with the brush's wander drawn from a stream
 * seeded by the stroke itself.
 *
 * While a stroke is still being drawn (`live`), its end is not known, so it
 * is not thinned yet -- and everything up to the last point comes out the
 * same as it will in the finished stroke, so the screen only has to add the
 * newest dabs.
 */
export function dabsAlong(points: number[], pressures: number[] | undefined, spec: BrushSpec, seed: string, live = false): Dab[] {
  const n = Math.floor(points.length / 2);
  if (!n) return [];
  const rand = seeded(seed);
  const out: Dab[] = [];
  let total = 0;
  if (!live) for (let i = 1; i < n; i += 1) total += Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1]);

  // The thin ends, measured from the start and from the end.
  let taperIn = taperLength(spec.taperIn, spec.size);
  let taperOut = live ? 0 : taperLength(spec.taperOut, spec.size);
  if (!live && taperIn + taperOut > total && total > 0) {
    const k = total / (taperIn + taperOut);
    taperIn *= k;
    taperOut *= k;
  }
  const variants = spec.images?.length ?? 0;
  const count = spec.count ?? 1;
  const floor = spec.pressureMin ?? 0;

  const make = (x: number, y: number, pressure: number, at: number, dx: number, dy: number) => {
    const p = Math.max(0.05, pressure);
    let size = spec.size * (spec.pressureSize ? floor + (1 - floor) * p : 1);
    const alpha = spec.flow * (spec.pressureOpacity ? p : 1);
    if (taperIn > 0 && at < taperIn) size *= 0.15 + 0.85 * (at / taperIn);
    if (taperOut > 0 && total - at < taperOut) size *= 0.15 + 0.85 * ((total - at) / taperOut);
    for (let k = 0; k < count; k += 1) {
      let s = size;
      let a = alpha;
      if (spec.jitterSize) s *= 1 - spec.jitterSize * rand();
      if (spec.jitterOpacity) a *= 1 - spec.jitterOpacity * rand();
      let px = x;
      let py = y;
      if (spec.scatter) {
        const r = spec.scatter * spec.size * (count > 1 ? Math.sqrt(rand()) : rand());
        const turn = rand() * Math.PI * 2;
        px += Math.cos(turn) * r;
        py += Math.sin(turn) * r;
      }
      let angle = (spec.angle * Math.PI) / 180;
      if (spec.follow && (dx || dy)) angle += Math.atan2(dy, dx);
      if (spec.jitterAngle) angle += ((rand() * 2 - 1) * spec.jitterAngle * Math.PI) / 180;
      const variant = variants > 1 ? Math.floor(rand() * variants) : 0;
      out.push({ x: px, y: py, size: Math.max(0.5, s), alpha: Math.max(0, Math.min(1, a)), angle, dx, dy, at, variant });
    }
  };

  if (n === 1) {
    make(points[0], points[1], pressures?.[0] ?? 1, 0, 0, 0);
    return out;
  }
  // A roller's picture has to be laid down without gaps, a sliver at a time.
  const step = spec.tip === "roller" ? Math.max(0.75, Math.min(3, spec.size / 40)) : Math.max(0.5, spec.size * spec.spacing);
  // The first dab's heading is only known once the path moves; find it first
  // so the first dab is the same live and finished.
  let first: [number, number] = [0, 0];
  for (let i = 0; i < n - 1; i += 1) {
    const len = Math.hypot(points[i * 2 + 2] - points[i * 2], points[i * 2 + 3] - points[i * 2 + 1]);
    if (len) {
      first = [(points[i * 2 + 2] - points[i * 2]) / len, (points[i * 2 + 3] - points[i * 2 + 1]) / len];
      break;
    }
  }
  make(points[0], points[1], pressures?.[0] ?? 1, 0, first[0], first[1]);
  // Distance walked since the last dab, carried from one segment to the next.
  let walked = 0;
  let along = 0;
  for (let i = 0; i < n - 1; i += 1) {
    const x0 = points[i * 2];
    const y0 = points[i * 2 + 1];
    const x1 = points[i * 2 + 2];
    const y1 = points[i * 2 + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!len) continue;
    const p0 = pressures?.[i] ?? 1;
    const p1 = pressures?.[i + 1] ?? 1;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    let pos = 0;
    while (walked + (len - pos) >= step) {
      pos += step - walked;
      walked = 0;
      const t = pos / len;
      make(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p0 + (p1 - p0) * t, along + pos, dx, dy);
    }
    walked += len - pos;
    along += len;
  }
  return out;
}

/** The mirror images a stroke is drawn with, when symmetry is on. */
export type Symmetry = "none" | "vertical" | "horizontal" | "quad" | `radial${number}`;

export const SYMMETRIES: Array<{ id: Symmetry; name: string }> = [
  { id: "none", name: "off" },
  { id: "vertical", name: "mirror left-right" },
  { id: "horizontal", name: "mirror top-bottom" },
  { id: "quad", name: "four ways" },
  { id: "radial6", name: "kaleidoscope 6" },
  { id: "radial8", name: "kaleidoscope 8" },
];

/** The same points, once for each mirror, around the middle of the canvas. */
export function mirrored(points: number[], sym: Symmetry | undefined, w: number, h: number): number[][] {
  if (!sym || sym === "none") return [points];
  const cx = w / 2;
  const cy = h / 2;
  const map = (fn: (x: number, y: number) => [number, number]) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < points.length; i += 2) out.push(...fn(points[i], points[i + 1]));
    return out;
  };
  if (sym === "vertical") return [points, map((x, y) => [2 * cx - x, y])];
  if (sym === "horizontal") return [points, map((x, y) => [x, 2 * cy - y])];
  if (sym === "quad") return [points, map((x, y) => [2 * cx - x, y]), map((x, y) => [x, 2 * cy - y]), map((x, y) => [2 * cx - x, 2 * cy - y])];
  const n = Math.max(2, Math.min(24, Number(sym.slice(6)) || 6));
  return Array.from({ length: n }, (_, k) => {
    const a = (k * 2 * Math.PI) / n;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return map((x, y) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
  });
}

/** Smooths the pointer as it moves: the pen trails behind the hand by the amount set, and shakes less. */
export function stabilize(prev: [number, number] | null, next: [number, number], amount: number): [number, number] {
  if (!prev || amount <= 0) return next;
  const k = 1 / (1 + amount * 1.5);
  return [prev[0] + (next[0] - prev[0]) * k, prev[1] + (next[1] - prev[1]) * k];
}
