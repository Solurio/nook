"use client";

import type { DoodleBrush, DoodleLayer, DoodleStroke } from "./types";

// The paint board is operation based: each stroke is stored (and synced) as a
// vector op, and rendered onto a raster <canvas>. That keeps collaboration and
// persistence cheap while giving real paint output -- soft brushes, opacity,
// pressure, layers and PNG export.

export const BRUSHES: DoodleBrush[] = ["pen", "marker", "airbrush", "eraser"];

export function defaultLayers(): DoodleLayer[] {
  return [{ id: "base", name: "layer 1", visible: true, opacity: 1, hue: 0 }];
}

export function layersOf(layers: DoodleLayer[] | undefined): DoodleLayer[] {
  return layers && layers.length > 0 ? layers : defaultLayers();
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function rgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function dab(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, brush: DoodleBrush, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (brush === "airbrush") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, 0.09));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
  } else if (brush === "marker") {
    const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r);
    g.addColorStop(0, rgba(color, 1));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = color; // pen / eraser (eraser colour is irrelevant under destination-out)
  }
  ctx.fill();
}

/** Stamps a stroke's dabs onto ctx (already set up for compositing). */
function stamp(ctx: CanvasRenderingContext2D, stroke: DoodleStroke, w: number, h: number, dpr: number) {
  const pts = stroke.points;
  const pr = stroke.pressures;
  const brush = stroke.brush ?? "pen";
  const sizePx = Math.max(1, stroke.size * dpr);
  const n = pts.length / 2;
  if (n === 0) return;

  const radiusAt = (i: number) => Math.max(0.4, (sizePx / 2) * (pr?.[i] ?? 1));

  if (n === 1) {
    dab(ctx, pts[0] * w, pts[1] * h, radiusAt(0), brush, stroke.color);
    return;
  }

  for (let i = 0; i < n - 1; i += 1) {
    const x0 = pts[i * 2] * w;
    const y0 = pts[i * 2 + 1] * h;
    const x1 = pts[(i + 1) * 2] * w;
    const y1 = pts[(i + 1) * 2 + 1] * h;
    const r0 = radiusAt(i);
    const r1 = radiusAt(i + 1);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(0.75, sizePx * 0.18);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      dab(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, brush, stroke.color);
    }
  }
}

/** Renders one stroke onto a layer canvas, honouring brush, opacity and erase. */
export function renderStroke(ctx: CanvasRenderingContext2D, stroke: DoodleStroke, w: number, h: number, dpr: number) {
  const brush = stroke.brush ?? "pen";
  const opacity = stroke.opacity ?? 1;

  if (brush === "eraser") {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    stamp(ctx, stroke, w, h, dpr);
    ctx.restore();
    return;
  }

  // Opaque hard pen can draw straight on; anything translucent or soft goes via
  // a scratch canvas so overlapping dabs within the stroke do not darken it.
  if (brush === "pen" && opacity >= 1) {
    stamp(ctx, stroke, w, h, dpr);
    return;
  }

  const scratch = makeCanvas(w, h);
  const sctx = scratch.getContext("2d");
  if (!sctx) return;
  stamp(sctx, stroke, w, h, dpr);
  ctx.save();
  ctx.globalAlpha = clamp(opacity, 0, 1);
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

/** Clears the target and paints every layer in order. */
export function renderComposite(
  target: HTMLCanvasElement,
  strokes: DoodleStroke[],
  layers: DoodleLayer[],
  dpr: number,
) {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const w = target.width;
  const h = target.height;
  ctx.clearRect(0, 0, w, h);

  for (const layer of layers) {
    if (!layer.visible) continue;
    const layerStrokes = strokes.filter((s) => (s.layer ?? "base") === layer.id);
    if (layerStrokes.length === 0) continue;

    const lc = makeCanvas(w, h);
    const lctx = lc.getContext("2d");
    if (!lctx) continue;
    for (const stroke of layerStrokes) renderStroke(lctx, stroke, w, h, dpr);

    ctx.save();
    ctx.globalAlpha = clamp(layer.opacity, 0, 1);
    if (layer.hue) ctx.filter = `hue-rotate(${layer.hue}deg)`;
    ctx.drawImage(lc, 0, 0);
    ctx.restore();
  }
}

/** Renders everything to a fresh canvas at the given size and returns it. */
export function exportCanvas(
  strokes: DoodleStroke[],
  layers: DoodleLayer[],
  width: number,
  height: number,
): HTMLCanvasElement {
  const c = makeCanvas(width, height);
  renderComposite(c, strokes, layers, 1);
  return c;
}
