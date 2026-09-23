// FireAlpaca's brushes, read from its own files, so a set made there paints
// here. FireAlpaca keeps them in its settings folder (on Windows,
// %LOCALAPPDATA%\FireAlpaca\FireAlpaca SE3): BrushNew.xml lists every brush
// and its settings, and brush_bitmap holds the pictures the picture brushes
// stamp -- PNGs, or .mdp files, FireAlpaca's own picture format.
//
// FireAlpaca numbers its per-type settings rather than naming them (option0
// to option8). What each means was worked out from the brushes it ships with:
// a picture brush's interval, whether it turns with the stroke, its angle and
// how much it turns at random; a scatter brush's spread, size and count. The
// results are close to the originals rather than the same, and a scripted
// brush (Lua, in FireAlpaca) becomes the nearest plain brush.

import { tidyBrush, type BrushBlend, type BrushSpec } from "./brush";

export interface FaBrush {
  type: string;
  name: string;
  attrs: Record<string, string>;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] === "#") return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? whole;
  });

/** Every brush in a BrushNew.xml, in its order. */
export function parseBrushes(xml: string): FaBrush[] {
  const out: FaBrush[] = [];
  for (const m of xml.matchAll(/<Brush\s([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = unescape(a[2]);
    if (!attrs.type) continue;
    out.push({ type: attrs.type.toLowerCase(), name: attrs.name || "brush", attrs });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

/** Pixels, four bytes each, not premultiplied. */
export interface Raster {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export interface MdpLayer extends Raster {
  name: string;
  visible: boolean;
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

/** Inflates zlib data with the browser's (or Node's) own stream. */
export const inflateStream: Inflate = async (data) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/**
 * An .mdp file's layers. The file is a header, an XML description, and
 * binary chunks ("PAC ") named in it; a layer's chunk is its picture in tiles
 * of 128 pixels, each one zlib-compressed on its own.
 */
export async function readMdp(bytes: Uint8Array, inflate: Inflate = inflateStream): Promise<{ w: number; h: number; layers: MdpLayer[] }> {
  const magic = String.fromCharCode(...bytes.subarray(0, 7));
  if (magic !== "mdipack") throw new Error("not an mdp file");
  const xmlLength = u32(bytes, 12);
  const xml = new TextDecoder().decode(bytes.subarray(20, 20 + xmlLength));
  const size = /<Mdiapp[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/.exec(xml);
  const w = Number(size?.[1] ?? 0);
  const h = Number(size?.[2] ?? 0);
  if (!w || !h || w * h > 40_000_000) throw new Error("a picture this size cannot be read");

  // The binary chunks, by name.
  const chunks = new Map<string, { kind: number; data: Uint8Array }>();
  for (let at = 20 + xmlLength; at + 132 <= bytes.length; ) {
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    const chunk = u32(bytes, at + 4);
    if (tag !== "PAC " || chunk < 132) break;
    const kind = u32(bytes, at + 8);
    const packed = u32(bytes, at + 12);
    const nameBytes = bytes.subarray(at + 68, at + 132);
    const end = nameBytes.indexOf(0);
    const name = new TextDecoder().decode(nameBytes.subarray(0, end < 0 ? 64 : end));
    chunks.set(name, { kind, data: bytes.subarray(at + 132, at + 132 + packed) });
    at += chunk;
  }

  const layers: MdpLayer[] = [];
  for (const m of xml.matchAll(/<Layer\s([^>]*?)\/?>/g)) {
    const a: Record<string, string> = {};
    for (const x of m[1].matchAll(/([\w:-]+)="([^"]*)"/g)) a[x[1]] = x[2];
    const chunk = a.bin ? chunks.get(a.bin) : undefined;
    if (!chunk) continue;
    const data = chunk.kind === 1 ? await inflate(chunk.data) : chunk.data;
    const lw = Number(a.width || w);
    const lh = Number(a.height || h);
    const ox = Number(a.ofsx || 0);
    const oy = Number(a.ofsy || 0);
    const type = a.type ?? "32bpp";
    // An ink layer's colour, as AARRGGBB.
    const ink = /^[0-9a-f]{8}$/i.test(a.color ?? "") ? [parseInt(a.color.slice(2, 4), 16), parseInt(a.color.slice(4, 6), 16), parseInt(a.color.slice(6, 8), 16)] : [0, 0, 0];
    const out = new Uint8ClampedArray(w * h * 4);
    const count = u32(data, 0);
    const tile = u32(data, 4) || 128;
    let at = 8;
    for (let t = 0; t < count && at + 16 <= data.length; t += 1) {
      const col = u32(data, at);
      const row = u32(data, at + 4);
      const length = u32(data, at + 12);
      at += 16;
      const raw = await inflate(data.subarray(at, at + length));
      at = (at + length + 3) & ~3;
      for (let y = 0; y < tile; y += 1) {
        const ly = row * tile + y;
        const py = ly + oy;
        if (ly >= lh || py < 0 || py >= h) continue;
        for (let x = 0; x < tile; x += 1) {
          const lx = col * tile + x;
          const px = lx + ox;
          if (lx >= lw || px < 0 || px >= w) continue;
          const o = (py * w + px) * 4;
          const p = y * tile + x;
          if (type === "32bpp") {
            out[o] = raw[p * 4 + 2];
            out[o + 1] = raw[p * 4 + 1];
            out[o + 2] = raw[p * 4];
            out[o + 3] = raw[p * 4 + 3];
          } else if (type === "8bpp") {
            out[o] = ink[0];
            out[o + 1] = ink[1];
            out[o + 2] = ink[2];
            out[o + 3] = raw[p];
          } else if (type === "1bpp") {
            const on = (raw[p >> 3] >> (7 - (p & 7))) & 1;
            out[o] = ink[0];
            out[o + 1] = ink[1];
            out[o + 2] = ink[2];
            out[o + 3] = on ? 255 : 0;
          }
        }
      }
    }
    const opacity = Number(a.alpha ?? 255) / 255;
    if (opacity < 1) for (let i = 3; i < out.length; i += 4) out[i] *= opacity;
    layers.push({ name: a.name ?? "", visible: a.visible !== "false", w, h, data: out });
  }
  // The file lists its layers top first.
  layers.reverse();
  return { w, h, layers };
}

/** Layers one on another, bottom first. */
export function flatten(w: number, h: number, layers: Raster[]): Raster {
  const out = new Uint8ClampedArray(w * h * 4);
  for (const layer of layers) {
    const d = layer.data;
    for (let i = 0; i < out.length; i += 4) {
      const a = d[i + 3] / 255;
      if (!a) continue;
      const b = out[i + 3] / 255;
      const outA = a + b * (1 - a);
      for (let c = 0; c < 3; c += 1) out[i + c] = (d[i + c] * a + out[i + c] * b * (1 - a)) / outA;
      out[i + 3] = outA * 255;
    }
  }
  return { w, h, data: out };
}

const luma = (d: Uint8ClampedArray, i: number) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

/** True when a picture's colours matter: a good share of what it paints is not grey. */
export function isColourful(r: Raster): boolean {
  let painted = 0;
  let coloured = 0;
  const d = r.data;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 64) continue;
    painted += 1;
    if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) coloured += 1;
  }
  return painted > 0 && coloured / painted > 0.3;
}

/**
 * A picture as a brush's ink: dark and solid is paint, light or see-through
 * is not -- the way FireAlpaca reads a picture brush. White, with the ink as alpha.
 */
export function inkOf(r: Raster): Raster {
  const out = new Uint8ClampedArray(r.data.length);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = r.data[i + 3] * (1 - luma(r.data, i) / 255);
  }
  return { w: r.w, h: r.h, data: out };
}

/** A picture no bigger than `max` on its long side, each new pixel the average of those it covers. */
export function shrink(r: Raster, max: number): Raster {
  const k = Math.min(1, max / Math.max(r.w, r.h));
  if (k >= 1) return r;
  const w = Math.max(1, Math.round(r.w * k));
  const h = Math.max(1, Math.round(r.h * k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy0 = Math.floor((y * r.h) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * r.h) / h));
    for (let x = 0; x < w; x += 1) {
      const sx0 = Math.floor((x * r.w) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * r.w) / w));
      let cr = 0;
      let cg = 0;
      let cb = 0;
      let ca = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        for (let sx = sx0; sx < sx1; sx += 1) {
          const i = (sy * r.w + sx) * 4;
          const a = r.data[i + 3];
          cr += r.data[i] * a;
          cg += r.data[i + 1] * a;
          cb += r.data[i + 2] * a;
          ca += a;
          n += 1;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = ca ? cr / ca : 0;
      out[o + 1] = ca ? cg / ca : 0;
      out[o + 2] = ca ? cb / ca : 0;
      out[o + 3] = ca / n;
    }
  }
  return { w, h, data: out };
}

/** Whether a picture has anything in it. */
export const hasPaint = (r: Raster) => r.data.some((v, i) => i % 4 === 3 && v > 8);

/**
 * The pictures a brush stamps, from its file: one, or several variants -- a
 * multi-layer .mdp's visible layers -- for a brush that picks one at random
 * per dab. Colourful ones keep their colours; the rest become ink.
 */
export function tipPictures(brush: FaBrush, layers: Raster[], w: number, h: number): { pictures: Raster[]; colourful: boolean } {
  const kind = brush.type;
  const opt = (i: number) => Number(brush.attrs[`option${i}`] ?? 0);
  const perDab = layers.length > 1 && (kind.startsWith("scatter") || (kind.startsWith("bitmap") && opt(8) === 1));
  const sources = (perDab ? layers : [flatten(w, h, layers)]).filter(hasPaint);
  if (!sources.length) return { pictures: [], colourful: false };
  // A roller says outright whether it keeps its colours; the others show it
  // -- except wet ones and ones that multiply, which are scans of paint on
  // paper, meant to be painted in the brush's colour.
  const wet = kind.endsWith("wc") || kind.endsWith("mix") || brush.attrs.blend === "mul";
  const colourful = kind === "roller" ? opt(0) === 0 : !wet && sources.some(isColourful);
  const max = kind === "roller" ? 384 : 256;
  return { pictures: sources.map((r) => shrink(colourful ? r : inkOf(r), max)), colourful };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const BLEND: Record<string, BrushBlend> = { add: "add", mul: "multiply", burn: "burn", overlay: "overlay", screen: "screen", dodge: "dodge", darken: "darken", lighten: "lighten" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Types that stamp a picture. */
export const usesPicture = (b: FaBrush) => /^(bitmap|scatter|roller)/.test(b.type) && Boolean(b.attrs.file);

/**
 * A FireAlpaca brush as a studio brush. `images` are where its pictures ended
 * up; a picture brush given none falls back to a round tip.
 */
export function brushFromFa(b: FaBrush, id: string, images: string[] = [], colourful = false): BrushSpec {
  const a = b.attrs;
  const num = (k: string, fallback = 0) => {
    const v = Number(a[k]);
    return Number.isFinite(v) ? v : fallback;
  };
  const opt = (i: number) => num(`option${i}`);
  const yes = (k: string) => a[k] === "true";
  const base: Partial<BrushSpec> = {
    id,
    name: b.name,
    source: "FireAlpaca",
    size: clamp(num("R", 10), 1, 1000),
    opacity: clamp(num("alpha", 1), 0.01, 1),
    flow: 1,
    hardness: a.aa === "off" ? 1 : 0.95,
    spacing: 0.06,
    pressureSize: yes("pressWidth"),
    pressureOpacity: yes("pressTrans"),
    pressureMin: yes("pressWidth") ? clamp(num("minR", 0), 0, 1) : 0,
    blend: BLEND[a.blend ?? ""] ?? "normal",
    grain: a.texFile ? clamp(num("texEffect", 0.3), 0, 1) * 0.8 : 0,
  };
  if (yes("iriNuki") || yes("pp")) {
    base.taperIn = clamp(num("ppFadeInLen", 0.2), 0, 1) * 0.5;
    base.taperOut = clamp(num("ppFadeOutLen", 0.2), 0, 1) * 0.5;
  }
  const picture = images.length ? { images, colorful: colourful } : {};
  switch (b.type) {
    case "pen":
    case "edge":
    case "edge2":
      return tidyBrush(base);
    case "air":
      return tidyBrush({ ...base, hardness: 0, flow: 0.15, spacing: 0.08 });
    case "erase":
      return tidyBrush({ ...base, mode: "erase", hardness: yes("softEdge") ? 0.3 : 1 });
    case "blur":
      return tidyBrush({ ...base, mode: "blur", strength: clamp(opt(0) / 100 || 0.4, 0.05, 1), pressureSize: false, spacing: 0.2 });
    case "finger":
      return tidyBrush({ ...base, mode: "smudge", strength: clamp(opt(0) / 100 || 0.5, 0.05, 1), hardness: 0.3, spacing: 0.1 });
    case "wc":
      // Blending and dilution: how much it mixes with what is there, and how thin it is.
      return tidyBrush({ ...base, hardness: yes("softEdge") ? 0.2 : 0.75, mix: (opt(0) / 100) * 0.7, flow: clamp(1 - (opt(1) / 100) * 0.7, 0.05, 1), spacing: 0.08 });
    case "mix":
      return tidyBrush({ ...base, hardness: yes("softEdge") ? 0.2 : 0.7, mix: 0.6, spacing: 0.08 });
    case "bitmap":
    case "bitmapwc": {
      const wet = b.type === "bitmapwc";
      return tidyBrush({
        ...base,
        tip: "image",
        ...picture,
        spacing: Math.max(0.02, opt(0) / 100),
        follow: opt(1) === 1,
        angle: (opt(2) - 50) * 3.6,
        jitterAngle: wet ? 0 : (clamp(opt(3), 0, 100) / 100) * 180,
        mix: wet ? (clamp(opt(4), 0, 100) / 100) * 0.7 : 0,
        flow: wet ? clamp(1 - (clamp(opt(5), 0, 100) / 100) * 0.6, 0.05, 1) : 1,
      });
    }
    case "scatter":
    case "scatterwc":
    case "scattermix": {
      const particle = clamp(opt(4) / 100 || 0.5, 0.05, 1);
      return tidyBrush({
        ...base,
        tip: "image",
        ...picture,
        size: clamp(num("R", 10) * particle * 1.2, 1, 1000),
        spacing: Math.max(0.05, opt(0) / 100),
        scatter: (clamp(opt(1), 0, 100) / 100) * (0.45 / particle),
        jitterSize: clamp(opt(2), 0, 100) / 100,
        jitterAngle: opt(3) ? 180 : 0,
        count: b.type === "scatter" ? 1 + Math.round(clamp(opt(8), 0, 100) / 7) : 1,
        mix: b.type === "scatter" ? 0 : (clamp(opt(6), 0, 100) / 100) * 0.6,
      });
    }
    case "roller":
      return tidyBrush({ ...base, tip: "roller", ...picture });
    case "program": {
      const file = (a.file ?? "").toLowerCase();
      if (file.startsWith("marker")) return tidyBrush({ ...base, hardness: 0.8 });
      if (file.startsWith("mizutama")) return tidyBrush({ ...base, spacing: 2, hardness: 1 });
      if (file.startsWith("kakeami")) return tidyBrush({ ...base, tip: "flat", roundness: 0.06, angle: 45, spacing: 0.9, jitterAngle: 8 });
      if (file.startsWith("electronic")) return tidyBrush({ ...base, tip: "square", spacing: 1.3, pressureSize: false });
      if (file.startsWith("stripe")) return tidyBrush({ ...base, tip: "flat", roundness: 0.08, follow: true, spacing: 0.6 });
      if (file.startsWith("analog")) return tidyBrush({ ...base, grain: 0.25, jitterOpacity: 0.25, spacing: 0.05 });
      return tidyBrush(base);
    }
    default:
      return tidyBrush(base);
  }
}
