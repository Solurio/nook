"use client";

// Drawing the list of ops into pictures. Every layer is a canvas the size of
// the document; ops are applied to their layer in order, and when the list
// only grows -- the usual case, somebody drew another stroke -- only the new
// ones are applied. An undo, or anything else that changes what came before,
// draws that layer again from the start.
//
// Selections are worked out from the select ops alone, never from the
// pictures, so a layer can be drawn again on its own and still come out the
// same. A wand selection and a fill that looked at the whole picture carry
// their region with them for the same reason.

import { BUILT_IN_BRUSHES, dabsAlong, mirrored, tidyBrush, type BrushSpec, type Dab } from "./brush";
import { hexToRgb, rgba } from "./color";
import { applyFilter, blurPixels, pushPixels } from "./filters";
import { combine, decodeMask, ellipseMask, emptyMask, fullMask, invertMask, maskBounds, polygonMask, rectMask, wandMask, type Mask } from "./mask";
import { seeded } from "./rng";
import { legacyToDoc, type FillOp, type PaintOp, type SelectOp, type StrokeOp } from "./ops";

export type Blend =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export const BLENDS: Array<{ id: Blend; name: string }> = [
  { id: "source-over", name: "normal" },
  { id: "multiply", name: "multiply" },
  { id: "screen", name: "screen" },
  { id: "overlay", name: "overlay" },
  { id: "darken", name: "darken" },
  { id: "lighten", name: "lighten" },
  { id: "color-dodge", name: "colour dodge" },
  { id: "color-burn", name: "colour burn" },
  { id: "hard-light", name: "hard light" },
  { id: "soft-light", name: "soft light" },
  { id: "difference", name: "difference" },
  { id: "exclusion", name: "exclusion" },
  { id: "hue", name: "hue" },
  { id: "saturation", name: "saturation" },
  { id: "color", name: "colour" },
  { id: "luminosity", name: "luminosity" },
];

/** Effects a layer shows without changing its pixels. */
export interface LayerEffects {
  blur?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  hue?: number;
  invert?: number;
  grayscale?: number;
  sepia?: number;
}

export interface StudioLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  /** Old boards' only effect; folded into effects.hue. */
  hue?: number;
  blend?: Blend;
  effects?: LayerEffects;
  /** Painted only where the layer beneath it has paint. */
  clip?: boolean;
  /** Nobody can draw on it. */
  locked?: boolean;
  /** New strokes only go where there is already paint. */
  alphaLock?: boolean;
}

export interface StudioDoc {
  w: number;
  h: number;
  /** The paper; null is transparent. */
  background: string | null;
}

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const ctxOf = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: false }) as CanvasRenderingContext2D;

export function effectsFilter(layer: StudioLayer): string {
  const e = { ...(layer.effects ?? {}), hue: (layer.effects?.hue ?? 0) + (layer.hue ?? 0) };
  const parts: string[] = [];
  if (e.blur) parts.push(`blur(${e.blur}px)`);
  if (e.brightness !== undefined && e.brightness !== 100) parts.push(`brightness(${e.brightness}%)`);
  if (e.contrast !== undefined && e.contrast !== 100) parts.push(`contrast(${e.contrast}%)`);
  if (e.saturate !== undefined && e.saturate !== 100) parts.push(`saturate(${e.saturate}%)`);
  if (e.hue) parts.push(`hue-rotate(${e.hue}deg)`);
  if (e.invert) parts.push(`invert(${e.invert}%)`);
  if (e.grayscale) parts.push(`grayscale(${e.grayscale}%)`);
  if (e.sepia) parts.push(`sepia(${e.sepia}%)`);
  return parts.join(" ") || "none";
}

/** Old strokes' brushes, as studio brushes. */
function legacySpec(op: StrokeOp): BrushSpec {
  const pick = (id: string) => BUILT_IN_BRUSHES.find((b) => b.id === id) as BrushSpec;
  const size = op.size;
  switch (op.brush) {
    case "marker":
      return tidyBrush({ ...pick("marker"), size, opacity: op.opacity ?? 1, flow: 1, hardness: 0.4 });
    case "airbrush":
      return tidyBrush({ ...pick("airbrush"), size, opacity: op.opacity ?? 1, flow: 0.09, pressureSize: true, pressureOpacity: false });
    case "eraser":
      return tidyBrush({ ...pick("eraser"), size, opacity: op.opacity ?? 1 });
    default:
      return tidyBrush({ ...pick("pen"), size, opacity: op.opacity ?? 1, spacing: 0.18 });
  }
}

export const specOf = (op: StrokeOp) => (op.spec ? tidyBrush(op.spec) : legacySpec(op));

/** A dab's tip, drawn once per stroke in its colour: dabs are this, scaled, turned and faded. */
function makeTip(spec: BrushSpec, color: string, seed: string): HTMLCanvasElement {
  const d = Math.max(4, Math.min(512, Math.ceil(spec.size)));
  const tip = makeCanvas(d, d);
  const ctx = ctxOf(tip);
  const r = d / 2;
  const { r: cr, g: cg, b: cb } = hexToRgb(color);
  if (spec.tip === "square" || spec.tip === "flat") {
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    if (spec.hardness < 0.95) ctx.filter = `blur(${(1 - spec.hardness) * r * 0.5}px)`;
    const inset = spec.hardness < 0.95 ? (1 - spec.hardness) * r * 0.5 : 0;
    ctx.fillRect(inset, inset, d - inset * 2, d - inset * 2);
    ctx.filter = "none";
  } else if (spec.tip === "spray") {
    const rand = seeded(`${seed}:tip`);
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    const dots = Math.round(12 + d * 0.8);
    for (let i = 0; i < dots; i += 1) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * (r - 1);
      ctx.beginPath();
      ctx.arc(r + Math.cos(a) * rr, r + Math.sin(a) * rr, Math.max(0.5, d / 60), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    const hard = Math.max(0, Math.min(0.99, spec.hardness));
    g.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
    g.addColorStop(hard, `rgba(${cr},${cg},${cb},1)`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, d, d);
  }
  if (spec.grain > 0 || spec.tip === "grain") {
    // Holes in the tip, like paper tooth, the same every time for this stroke.
    const img = ctx.getImageData(0, 0, d, d);
    const rand = seeded(`${seed}:grain`);
    const k = Math.max(spec.grain, spec.tip === "grain" ? 0.45 : 0);
    for (let i = 3; i < img.data.length; i += 4) if (rand() < k) img.data[i] = img.data[i] * rand() * 0.4;
    ctx.putImageData(img, 0, 0);
  }
  return tip;
}

function stampDabs(ctx: CanvasRenderingContext2D, tip: HTMLCanvasElement, dabs: Dab[], spec: BrushSpec, ox: number, oy: number) {
  for (const dab of dabs) {
    if (dab.alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = dab.alpha;
    ctx.translate(dab.x - ox, dab.y - oy);
    if (dab.angle) ctx.rotate(dab.angle);
    ctx.scale(1, spec.tip === "round" || spec.tip === "grain" || spec.tip === "flat" || spec.tip === "square" ? spec.roundness : 1);
    ctx.drawImage(tip, -dab.size / 2, -dab.size / 2, dab.size, dab.size);
    ctx.restore();
  }
}

/**
 * Where ops that name no layer go: old boards' strokes. Those boards called
 * their first layer "base", and it keeps them wherever it is moved to.
 */
export const homeLayer = (layers: StudioLayer[]) => (layers.some((l) => l.id === "base") ? "base" : (layers[0]?.id ?? "base"));

/** The ops drawn on one layer. */
export const opsOn = (ops: PaintOp[], layers: StudioLayer[], layer: string) => {
  const home = homeLayer(layers);
  return ops.filter((op) => op.kind !== "select" && (op.layer ?? home) === layer);
};

export class Studio {
  readonly doc: StudioDoc;
  private canvases = new Map<string, HTMLCanvasElement>();
  private applied = new Map<string, string[]>();
  private selections = new Map<string, Mask | null>();
  private selectionOrder: string[] = [];
  private maskCanvases = new Map<string, HTMLCanvasElement>();
  private images = new Map<string, HTMLImageElement | "loading" | "failed">();
  /** Layers drawn before an image they use had arrived. */
  private waiting = new Set<string>();
  private onImage: () => void;
  /** Fonts asked for once already, so one that never loads is not asked for forever. */
  private fonts = new Set<string>();

  constructor(doc: StudioDoc, onImage: () => void = () => {}) {
    this.doc = doc;
    this.onImage = onImage;
  }

  canvasOf(layer: string): HTMLCanvasElement {
    let c = this.canvases.get(layer);
    if (!c) {
      c = makeCanvas(this.doc.w, this.doc.h);
      this.canvases.set(layer, c);
    }
    return c;
  }

  /** The selection in force after an op, or null for none. */
  maskOf(id: string | null | undefined): Mask | null {
    if (!id) return null;
    return this.selections.get(id) ?? null;
  }

  /** The selection as a canvas whose alpha is the mask, for clipping paint to it. */
  private maskCanvas(id: string): HTMLCanvasElement | null {
    const mask = this.maskOf(id);
    if (!mask) return null;
    let c = this.maskCanvases.get(id);
    if (c) return c;
    c = makeCanvas(mask.w, mask.h);
    const img = new ImageData(mask.w, mask.h);
    for (let i = 0; i < mask.data.length; i += 1) img.data[i * 4 + 3] = mask.data[i];
    ctxOf(c).putImageData(img, 0, 0);
    this.maskCanvases.set(id, c);
    return c;
  }

  /** Works out every selection from the select ops, in order. Returns the ids whose selection changed. */
  private syncSelections(ops: PaintOp[]): Set<string> {
    const selects = ops.filter((op): op is SelectOp => op.kind === "select");
    const order = selects.map((op) => op.id);
    let same = 0;
    while (same < order.length && same < this.selectionOrder.length && order[same] === this.selectionOrder[same]) same += 1;
    const changed = new Set<string>(this.selectionOrder.slice(same));
    for (const id of this.selectionOrder.slice(same)) {
      this.selections.delete(id);
      this.maskCanvases.delete(id);
    }
    for (const op of selects.slice(same)) {
      // Each builds on the selection its maker had, not on whoever selected last.
      this.selections.set(op.id, this.selectionFor(op, this.maskOf(op.from)));
      changed.add(op.id);
    }
    // Only the ones that replaced something already drawn matter to the layers.
    const replaced = new Set<string>([...changed].filter((id) => this.selectionOrder.includes(id)));
    this.selectionOrder = order;
    return replaced;
  }

  private selectionFor(op: SelectOp, current: Mask | null): Mask | null {
    const { w, h } = this.doc;
    const s = op.shape;
    let made: Mask;
    switch (s.type) {
      case "none":
        return null;
      case "all":
        return fullMask(w, h);
      case "invert":
        return current ? invertMask(current) : null;
      case "rect":
        made = rectMask(w, h, s.x0, s.y0, s.x1, s.y1);
        break;
      case "ellipse":
        made = ellipseMask(w, h, s.x0, s.y0, s.x1, s.y1);
        break;
      case "lasso":
        made = polygonMask(w, h, s.points);
        break;
      case "mask":
        made = decodeMask(s.data, w, h);
        break;
      default:
        return current;
    }
    return combine(current, made, op.mode);
  }

  /**
   * Brings every layer up to date with the ops. Returns true when anything
   * was drawn, so the screen knows to show it again.
   */
  sync(ops: PaintOp[], layers: StudioLayer[]): boolean {
    const replacedSelections = this.syncSelections(ops);
    const byLayer = new Map<string, PaintOp[]>();
    for (const layer of layers) byLayer.set(layer.id, []);
    const home = homeLayer(layers);
    for (const op of ops) {
      if (op.kind === "select") continue;
      // A layer that is gone takes its ops with it, even before they are deleted.
      byLayer.get(op.layer ?? home)?.push(op);
    }
    let changed = false;
    for (const [id, list] of byLayer) {
      const done = this.applied.get(id) ?? [];
      const ids = list.map((op) => op.id);
      const prefix = done.length <= ids.length && done.every((d, i) => d === ids[i]);
      const touchesReplaced = list.some((op) => op.sel && replacedSelections.has(op.sel));
      const rebuild = !prefix || touchesReplaced || this.waiting.has(id);
      if (!rebuild && done.length === ids.length) continue;
      const canvas = this.canvasOf(id);
      const from = rebuild ? 0 : done.length;
      if (rebuild) {
        ctxOf(canvas).clearRect(0, 0, canvas.width, canvas.height);
        this.waiting.delete(id);
      }
      for (let i = from; i < list.length; i += 1) this.apply(canvas, list[i], id);
      this.applied.set(id, ids);
      changed = true;
    }
    for (const id of [...this.canvases.keys()]) {
      if (!byLayer.has(id)) {
        this.canvases.delete(id);
        this.applied.delete(id);
        changed = true;
      }
    }
    return changed;
  }

  /** Draws every layer from nothing. */
  reset() {
    this.applied.clear();
    this.selections.clear();
    this.selectionOrder = [];
    this.maskCanvases.clear();
    for (const c of this.canvases.values()) ctxOf(c).clearRect(0, 0, c.width, c.height);
  }

  // -------------------------------------------------------------------------
  // One op
  // -------------------------------------------------------------------------

  /** Keeps paint inside the selection: the scratch is cut to the mask. */
  private clipToSelection(scratch: HTMLCanvasElement, sel: string | null | undefined, ox: number, oy: number) {
    if (!sel) return;
    const mask = this.maskCanvas(sel);
    if (!mask) return;
    const ctx = ctxOf(scratch);
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, -ox, -oy);
    ctx.restore();
  }

  /** Puts a scratch drawing onto the layer: painted on, painted only over paint, or rubbed out. */
  private land(canvas: HTMLCanvasElement, scratch: HTMLCanvasElement, ox: number, oy: number, alpha: number, how: "paint" | "atop" | "erase") {
    const ctx = ctxOf(canvas);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.globalCompositeOperation = how === "erase" ? "destination-out" : how === "atop" ? "source-atop" : "source-over";
    ctx.drawImage(scratch, ox, oy);
    ctx.restore();
  }

  apply(canvas: HTMLCanvasElement, raw: PaintOp, layerId: string) {
    const { w, h } = this.doc;
    const op = raw.kind === undefined || raw.kind === "stroke" ? legacyToDoc(raw as StrokeOp, w, h) : raw;
    switch (op.kind) {
      case undefined:
      case "stroke": {
        const stroke = op as StrokeOp;
        if (stroke.brush === "fill") {
          this.fill(canvas, { id: stroke.id, kind: "fill", x: stroke.points[0], y: stroke.points[1], color: stroke.color, opacity: stroke.opacity ?? 1, tolerance: 32, sample: "layer", grow: 0, sel: stroke.sel });
          return;
        }
        this.stroke(canvas, stroke);
        return;
      }
      case "fill":
        this.fill(canvas, op);
        return;
      case "gradient": {
        const scratch = makeCanvas(w, h);
        const ctx = ctxOf(scratch);
        const g =
          op.shape === "radial"
            ? ctx.createRadialGradient(op.x0, op.y0, 0, op.x0, op.y0, Math.max(1, Math.hypot(op.x1 - op.x0, op.y1 - op.y0)))
            : ctx.createLinearGradient(op.x0, op.y0, op.x1, op.y1);
        g.addColorStop(0, rgba(op.from, 1));
        g.addColorStop(1, op.to ? rgba(op.to, 1) : rgba(op.from, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        this.clipToSelection(scratch, op.sel, 0, 0);
        this.land(canvas, scratch, 0, 0, op.opacity, "paint");
        return;
      }
      case "shape": {
        const scratch = makeCanvas(w, h);
        const ctx = ctxOf(scratch);
        ctx.strokeStyle = op.color;
        ctx.fillStyle = op.color;
        ctx.lineWidth = Math.max(0.5, op.width);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        if (op.shape === "line") {
          ctx.moveTo(op.x0, op.y0);
          ctx.lineTo(op.x1, op.y1);
          ctx.stroke();
        } else {
          const x = Math.min(op.x0, op.x1);
          const y = Math.min(op.y0, op.y1);
          const bw = Math.abs(op.x1 - op.x0);
          const bh = Math.abs(op.y1 - op.y0);
          if (op.shape === "rect") ctx.rect(x, y, bw, bh);
          else ctx.ellipse(x + bw / 2, y + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
          if (op.fill) ctx.fill();
          else ctx.stroke();
        }
        this.clipToSelection(scratch, op.sel, 0, 0);
        this.land(canvas, scratch, 0, 0, op.opacity, "paint");
        return;
      }
      case "text": {
        const scratch = makeCanvas(w, h);
        const ctx = ctxOf(scratch);
        ctx.fillStyle = op.color;
        ctx.textBaseline = "top";
        ctx.font = `${op.italic ? "italic " : ""}${op.bold ? "700 " : ""}${Math.max(4, op.size)}px ${op.font}`;
        // A font that has not arrived yet: draw with what there is, and again once it comes.
        if (typeof document !== "undefined" && document.fonts && !this.fonts.has(ctx.font) && !document.fonts.check(ctx.font)) {
          this.fonts.add(ctx.font);
          this.waiting.add(layerId);
          void document.fonts.load(ctx.font).then(
            () => this.onImage(),
            () => {},
          );
        }
        op.text.split("\n").forEach((line, i) => ctx.fillText(line, op.x, op.y + i * op.size * 1.2));
        this.clipToSelection(scratch, op.sel, 0, 0);
        this.land(canvas, scratch, 0, 0, op.opacity, "paint");
        return;
      }
      case "clear": {
        const ctx = ctxOf(canvas);
        const mask = op.sel ? this.maskCanvas(op.sel) : null;
        if (!mask) {
          ctx.clearRect(0, 0, w, h);
          return;
        }
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(mask, 0, 0);
        ctx.restore();
        return;
      }
      case "transform": {
        const piece = makeCanvas(w, h);
        const pctx = ctxOf(piece);
        pctx.drawImage(canvas, 0, 0);
        const mask = op.sel ? this.maskCanvas(op.sel) : null;
        const ctx = ctxOf(canvas);
        if (mask) {
          pctx.globalCompositeOperation = "destination-in";
          pctx.drawImage(mask, 0, 0);
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.drawImage(mask, 0, 0);
          ctx.restore();
        } else {
          ctx.clearRect(0, 0, w, h);
        }
        ctx.save();
        const [a, b, c, d, e, f] = op.m;
        ctx.setTransform(a, b, c, d, e, f);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(piece, 0, 0);
        ctx.restore();
        return;
      }
      case "filter": {
        const mask = this.maskOf(op.sel);
        const box = mask ? maskBounds(mask) : { x: 0, y: 0, w, h };
        if (!box) return;
        const ctx = ctxOf(canvas);
        const img = ctx.getImageData(box.x, box.y, box.w, box.h);
        let crop: Uint8Array | null = null;
        if (mask) {
          crop = new Uint8Array(box.w * box.h);
          for (let y = 0; y < box.h; y += 1) crop.set(mask.data.subarray((box.y + y) * w + box.x, (box.y + y) * w + box.x + box.w), y * box.w);
        }
        applyFilter(img.data, box.w, box.h, op.filter, op.amount, crop, op.id);
        ctx.putImageData(img, box.x, box.y);
        return;
      }
      case "image": {
        const found = this.images.get(op.url);
        if (!found || found === "loading") {
          this.waiting.add(layerId);
          if (!found) this.load(op.url);
          return;
        }
        if (found === "failed") return;
        const scratch = makeCanvas(w, h);
        const ctx = ctxOf(scratch);
        ctx.save();
        ctx.translate(op.x + op.w / 2, op.y + op.h / 2);
        if (op.rotation) ctx.rotate((op.rotation * Math.PI) / 180);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(found, -op.w / 2, -op.h / 2, op.w, op.h);
        ctx.restore();
        this.clipToSelection(scratch, op.sel, 0, 0);
        this.land(canvas, scratch, 0, 0, op.opacity ?? 1, "paint");
        return;
      }
    }
  }

  private load(url: string) {
    this.images.set(url, "loading");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.images.set(url, img);
      this.onImage();
    };
    img.onerror = () => {
      this.images.set(url, "failed");
      this.onImage();
    };
    img.src = url;
  }

  private fill(canvas: HTMLCanvasElement, op: FillOp) {
    const { w, h } = this.doc;
    const ctx = ctxOf(canvas);
    let region: Mask;
    if (op.region) region = decodeMask(op.region, w, h);
    else {
      const px = ctx.getImageData(0, 0, w, h).data;
      region = wandMask(px, w, h, op.x, op.y, op.tolerance, true);
    }
    if (op.grow > 0) region = grow(region, op.grow);
    const sel = this.maskOf(op.sel);
    const { r, g, b } = hexToRgb(op.color);
    const scratch = makeCanvas(w, h);
    const sctx = ctxOf(scratch);
    const img = sctx.createImageData(w, h);
    for (let i = 0; i < region.data.length; i += 1) {
      const k = sel ? Math.min(region.data[i], sel.data[i]) : region.data[i];
      if (!k) continue;
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = k;
    }
    sctx.putImageData(img, 0, 0);
    this.land(canvas, scratch, 0, 0, op.opacity, "paint");
  }

  /** A stroke onto its layer: paint and erase through a scratch, the rest straight onto the pixels. */
  stroke(canvas: HTMLCanvasElement, op: StrokeOp, fromDab = 0): number {
    const { w, h } = this.doc;
    const spec = specOf(op);
    const paths = mirrored(op.points, op.sym, w, h);
    const lists = paths.map((points, k) => dabsAlong(points, op.pressures, spec, `${op.id}:${k}`));
    if (spec.mode === "paint" || spec.mode === "erase") {
      const all = lists.flat();
      if (!all.length) return 0;
      const pad = spec.size;
      const x0 = Math.max(0, Math.floor(Math.min(...all.map((d) => d.x)) - pad));
      const y0 = Math.max(0, Math.floor(Math.min(...all.map((d) => d.y)) - pad));
      const x1 = Math.min(w, Math.ceil(Math.max(...all.map((d) => d.x)) + pad));
      const y1 = Math.min(h, Math.ceil(Math.max(...all.map((d) => d.y)) + pad));
      if (x1 <= x0 || y1 <= y0) return 0;
      const scratch = makeCanvas(x1 - x0, y1 - y0);
      const tip = makeTip(spec, op.color, op.id);
      for (const dabs of lists) stampDabs(ctxOf(scratch), tip, dabs, spec, x0, y0);
      this.clipToSelection(scratch, op.sel, x0, y0);
      this.land(canvas, scratch, x0, y0, spec.opacity, spec.mode === "erase" ? "erase" : op.atop ? "atop" : "paint");
      return all.length;
    }
    // Smudge, blur and liquify read the layer as they go.
    const mask = this.maskOf(op.sel);
    const ctx = ctxOf(canvas);
    let n = 0;
    for (const dabs of lists) {
      for (let i = Math.max(fromDab, 0); i < dabs.length; i += 1) {
        this.touch(ctx, dabs[i], i > 0 ? dabs[i - 1] : null, spec, mask);
        n += 1;
      }
    }
    return n;
  }

  /** One dab of smudge, blur or liquify, straight onto the pixels. */
  touch(ctx: CanvasRenderingContext2D, dab: Dab, prev: Dab | null, spec: BrushSpec, mask: Mask | null) {
    const { w, h } = this.doc;
    const r = Math.max(2, dab.size / 2);
    const x0 = Math.max(0, Math.floor(dab.x - r - 2));
    const y0 = Math.max(0, Math.floor(dab.y - r - 2));
    const x1 = Math.min(w, Math.ceil(dab.x + r + 2));
    const y1 = Math.min(h, Math.ceil(dab.y + r + 2));
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return;
    const img = ctx.getImageData(x0, y0, bw, bh);
    const before = new Uint8ClampedArray(img.data);
    const cx = dab.x - x0;
    const cy = dab.y - y0;
    if (spec.mode === "liquify") {
      const step = prev ? Math.hypot(dab.x - prev.x, dab.y - prev.y) : 0;
      pushPixels(img.data, bw, bh, cx, cy, r, dab.dx * step * 1.2, dab.dy * step * 1.2, spec.strength);
    } else if (spec.mode === "blur") {
      const soft = blurPixels(img.data, bw, bh, Math.max(2, r * 0.35));
      img.data.set(soft);
    } else if (spec.mode === "smudge" && prev) {
      // Drag the paint from where the brush was to where it is.
      const src = ctx.getImageData(Math.max(0, Math.floor(prev.x - r - 2)), Math.max(0, Math.floor(prev.y - r - 2)), bw, bh);
      const k = spec.strength;
      for (let i = 0; i < img.data.length; i += 4) {
        for (let c = 0; c < 4; c += 1) img.data[i + c] = img.data[i + c] + (src.data[i + c] - img.data[i + c]) * k;
      }
    }
    // Soft edge, and the selection: mix back towards what was there.
    const hard = spec.hardness;
    for (let y = 0; y < bh; y += 1) {
      for (let x = 0; x < bw; x += 1) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        let k = d >= 1 ? 0 : d <= hard ? 1 : 1 - (d - hard) / Math.max(0.01, 1 - hard);
        if (mask) k *= mask.data[(y0 + y) * w + (x0 + x)] / 255;
        if (k >= 1) continue;
        const i = (y * bw + x) * 4;
        for (let c = 0; c < 4; c += 1) img.data[i + c] = before[i + c] + (img.data[i + c] - before[i + c]) * k;
      }
    }
    ctx.putImageData(img, x0, y0);
  }

  // -------------------------------------------------------------------------
  // Putting the layers together
  // -------------------------------------------------------------------------

  /**
   * Every visible layer, bottom to top, onto a canvas the size of the
   * document: blend modes, effects, and layers clipped to the one beneath.
   * One layer's canvas can be swapped for another, for a stroke in progress.
   * The paper is the colour under everything; null leaves it see-through.
   */
  composite(target: HTMLCanvasElement, layers: StudioLayer[], swap?: { layer: string; canvas: HTMLCanvasElement } | null, paper: string | null = null) {
    const ctx = ctxOf(target);
    const { w, h } = this.doc;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    if (paper) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, w, h);
    }
    const canvasFor = (layer: StudioLayer) => (swap && swap.layer === layer.id ? swap.canvas : this.canvasOf(layer.id));
    let i = 0;
    while (i < layers.length) {
      const base = layers[i];
      let j = i + 1;
      while (j < layers.length && layers[j].clip) j += 1;
      const clips = layers.slice(i + 1, j).filter((l) => l.visible);
      i = j;
      if (!base.visible) continue;
      if (!clips.length) {
        ctx.globalAlpha = base.opacity;
        ctx.globalCompositeOperation = base.blend ?? "source-over";
        ctx.filter = effectsFilter(base);
        ctx.drawImage(canvasFor(base), 0, 0);
        ctx.filter = "none";
        continue;
      }
      const group = makeCanvas(w, h);
      const g = ctxOf(group);
      g.filter = effectsFilter(base);
      g.drawImage(canvasFor(base), 0, 0);
      g.filter = "none";
      for (const clip of clips) {
        g.globalCompositeOperation = "source-atop";
        g.globalAlpha = clip.opacity;
        g.filter = effectsFilter(clip);
        g.drawImage(canvasFor(clip), 0, 0);
        g.filter = "none";
      }
      ctx.globalAlpha = base.opacity;
      ctx.globalCompositeOperation = base.blend ?? "source-over";
      ctx.drawImage(group, 0, 0);
    }
    ctx.restore();
  }

  /** The picture's pixels at a point, for the eyedropper. */
  pick(layers: StudioLayer[], x: number, y: number, paper: string | null): string | null {
    const c = makeCanvas(this.doc.w, this.doc.h);
    this.composite(c, layers, null, paper);
    const [r, g, b, a] = ctxOf(c).getImageData(Math.round(x), Math.round(y), 1, 1).data;
    if (!a) return null;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  /** A region picked with the wand, from one layer or the whole picture. */
  wand(layers: StudioLayer[], layer: string, x: number, y: number, tolerance: number, all: boolean, contiguous = true): Mask {
    const { w, h } = this.doc;
    let px: Uint8ClampedArray;
    if (all) {
      const c = makeCanvas(w, h);
      this.composite(c, layers, null, null);
      px = ctxOf(c).getImageData(0, 0, w, h).data;
    } else {
      px = ctxOf(this.canvasOf(layer)).getImageData(0, 0, w, h).data;
    }
    return wandMask(px, w, h, x, y, tolerance, contiguous);
  }

  /** Where a layer has any paint at all, or null when it is empty. */
  bounds(layer: string): { x: number; y: number; w: number; h: number } | null {
    const { w, h } = this.doc;
    const px = ctxOf(this.canvasOf(layer)).getImageData(0, 0, w, h).data;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!px[(y * w + x) * 4 + 3]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** A small picture of one layer, for the layers list. */
  thumbnail(layer: string, size = 48): string {
    const src = this.canvasOf(layer);
    const k = size / Math.max(src.width, src.height);
    const c = makeCanvas(src.width * k, src.height * k);
    ctxOf(c).drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }
}

/** A mask made fatter by some pixels, to close the gap a fill leaves under line art. */
export function grow(mask: Mask, by: number): Mask {
  const r = Math.max(1, Math.round(by));
  const { w, h } = mask;
  const horizontal = emptyMask(w, h);
  for (let y = 0; y < h; y += 1) {
    // Two passes: distance to the nearest set pixel on each side.
    let prev = -Infinity;
    for (let x = 0; x < w; x += 1) {
      if (mask.data[y * w + x]) prev = x;
      if (x - prev <= r) horizontal.data[y * w + x] = 255;
    }
    let next = Infinity;
    for (let x = w - 1; x >= 0; x -= 1) {
      if (mask.data[y * w + x]) next = x;
      if (next - x <= r) horizontal.data[y * w + x] = 255;
    }
  }
  const out = emptyMask(w, h);
  for (let x = 0; x < w; x += 1) {
    let prev = -Infinity;
    for (let y = 0; y < h; y += 1) {
      if (horizontal.data[y * w + x]) prev = y;
      if (y - prev <= r) out.data[y * w + x] = 255;
    }
    let next = Infinity;
    for (let y = h - 1; y >= 0; y -= 1) {
      if (horizontal.data[y * w + x]) next = y;
      if (next - y <= r) out.data[y * w + x] = 255;
    }
  }
  return out;
}

/** The whole picture as a file: PNG (transparent where there is no paper) or JPEG on white. */
export function exportPicture(studio: Studio, layers: StudioLayer[], paper: string | null, type: "png" | "jpeg" | "transparent", scale = 1): Promise<Blob | null> {
  const { w, h } = studio.doc;
  const full = makeCanvas(w, h);
  studio.composite(full, layers, null, type === "transparent" ? null : paper);
  let out = full;
  if (scale !== 1 || type === "jpeg") {
    out = makeCanvas(w * scale, h * scale);
    const ctx = ctxOf(out);
    if (type === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(full, 0, 0, out.width, out.height);
  }
  return new Promise((resolve) => out.toBlob((b) => resolve(b), type === "jpeg" ? "image/jpeg" : "image/png", 0.92));
}
