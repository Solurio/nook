"use client";

import type { DoodleBrush, DoodleLayer, DoodleStroke } from "./types";

// The paint board is operation based: each stroke is stored (and synced) as a
// vector op, and rendered onto a raster <canvas>. That keeps collaboration and
// persistence cheap while giving real paint output -- soft brushes, opacity,
// pressure, layers and PNG export.

export const BRUSHES: DoodleBrush[] = ["pen", "marker", "airbrush", "eraser", "fill"];

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

/**
 * Paint bucket. Spreads from the seed pixel across everything close enough in
 * colour and stops at the edges, the way a fill tool is expected to behave.
 *
 * It works on the layer it is poured into, which keeps it deterministic: every
 * client replays the same ops in the same order and lands on the same picture.
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  seedX: number,
  seedY: number,
  hex: string,
  w: number,
  h: number,
  tolerance = 32,
) {
  const image = ctx.getImageData(0, 0, w, h);
  fillPixels(image.data, w, h, seedX, seedY, hex, tolerance);
  ctx.putImageData(image, 0, 0);
}

/**
 * The bucket itself, over raw RGBA. Split out from the canvas so the spreading
 * rules can be tested without a browser.
 */
export function fillPixels(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  seedX: number,
  seedY: number,
  hex: string,
  tolerance = 32,
): number {
  const x0 = clamp(Math.round(seedX), 0, w - 1);
  const y0 = clamp(Math.round(seedY), 0, h - 1);
  const at = (x: number, y: number) => (y * w + x) * 4;

  const start = at(x0, y0);
  const sr = px[start];
  const sg = px[start + 1];
  const sb = px[start + 2];
  const sa = px[start + 3];

  let t = hex.replace("#", "");
  if (t.length === 3) t = t.split("").map((c) => c + c).join("");
  const tr = parseInt(t.slice(0, 2), 16) || 0;
  const tg = parseInt(t.slice(2, 4), 16) || 0;
  const tb = parseInt(t.slice(4, 6), 16) || 0;

  // Pouring the colour that is already there would spin without changing a thing.
  if (sr === tr && sg === tg && sb === tb && sa === 255) return 0;

  const limit = tolerance * tolerance * 4;
  const close = (i: number) => {
    const dr = px[i] - sr;
    const dg = px[i + 1] - sg;
    const db = px[i + 2] - sb;
    const da = px[i + 3] - sa;
    return dr * dr + dg * dg + db * db + da * da <= limit;
  };

  // Scanline flood: walk each row as far as it goes, then seed the rows above
  // and below. Far fewer stack entries than pushing every pixel.
  const stack: number[] = [x0, y0];
  const seen = new Uint8Array(w * h);
  let painted = 0;

  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (seen[y * w + x]) continue;

    let left = x;
    while (left > 0 && close(at(left - 1, y))) left -= 1;
    let right = x;
    while (right < w - 1 && close(at(right + 1, y))) right += 1;

    for (let i = left; i <= right; i += 1) {
      const p = at(i, y);
      px[p] = tr;
      px[p + 1] = tg;
      px[p + 2] = tb;
      px[p + 3] = 255;
      seen[y * w + i] = 1;
      painted += 1;

      if (y > 0) {
        const up = at(i, y - 1);
        if (!seen[(y - 1) * w + i] && close(up)) stack.push(i, y - 1);
      }
      if (y < h - 1) {
        const down = at(i, y + 1);
        if (!seen[(y + 1) * w + i] && close(down)) stack.push(i, y + 1);
      }
    }
  }

  return painted;
}

/** Renders one stroke onto a layer canvas, honouring brush, opacity and erase. */
export function renderStroke(ctx: CanvasRenderingContext2D, stroke: DoodleStroke, w: number, h: number, dpr: number) {
  const brush = stroke.brush ?? "pen";
  const opacity = stroke.opacity ?? 1;

  if (brush === "fill") {
    const x = (stroke.points[0] ?? 0) * w;
    const y = (stroke.points[1] ?? 0) * h;
    if (opacity >= 1) {
      floodFill(ctx, x, y, stroke.color, w, h);
      return;
    }
    // A translucent pour goes through a scratch layer so it tints rather than
    // replaces what is underneath.
    const scratch = makeCanvas(w, h);
    const sctx = scratch.getContext("2d");
    if (!sctx) return;
    sctx.drawImage(ctx.canvas, 0, 0);
    floodFill(sctx, x, y, stroke.color, w, h);
    ctx.save();
    ctx.globalAlpha = clamp(opacity, 0, 1);
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
    return;
  }

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
