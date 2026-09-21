// What can be done to a picture, as data. The studio keeps a picture as the
// list of things done to it, in order; every screen draws the same list and
// gets the same picture. Each op names the layer it happened on and, when a
// selection was in force, the selection it was kept inside.
//
// Strokes from before the studio (normalised points, sizes in screen pixels,
// a brush named "pen" or "marker") are still ops: see `legacyToDoc`.

import type { BrushSpec, Symmetry } from "./brush";
import type { Combine } from "./mask";
import type { FilterKind } from "./filters";

interface OpBase {
  id: string;
  /** The layer it was done on; the first layer when absent. */
  layer?: string;
  /** The selection it was kept inside: the id of the op that made it. */
  sel?: string | null;
  /** Who did it, for undoing your own. */
  by?: string;
}

/** A stroke. Old strokes have no kind and normalised points; new ones are in canvas pixels, with their brush. */
export interface StrokeOp extends OpBase {
  kind?: "stroke";
  points: number[];
  pressures?: number[];
  color: string;
  /** Diameter: canvas pixels for new strokes, screen pixels for old ones. */
  size: number;
  opacity?: number;
  /** Old strokes' brush: pen, marker, airbrush, eraser, fill. */
  brush?: "pen" | "marker" | "airbrush" | "eraser" | "fill";
  /** New strokes: the brush, whole, as it was. */
  spec?: BrushSpec;
  sym?: Symmetry;
  /** Painted only where the layer already has paint (the layer's alpha was locked). */
  atop?: boolean;
  /** Points are in canvas pixels. */
  doc?: boolean;
}

export interface FillOp extends OpBase {
  kind: "fill";
  x: number;
  y: number;
  color: string;
  opacity: number;
  /** How different a colour can be and still be filled over, 0..255. */
  tolerance: number;
  /** Read the edges from this layer only, or from the whole picture. */
  sample: "layer" | "all";
  /** Grow the fill this many pixels, to close the gap under line art. */
  grow: number;
  /** When it looked at the whole picture: the region it found, written down, so it lands the same everywhere. */
  region?: string;
}

export interface GradientOp extends OpBase {
  kind: "gradient";
  shape: "linear" | "radial";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  from: string;
  /** A second colour, or null to fade to nothing. */
  to: string | null;
  opacity: number;
}

export interface ShapeOp extends OpBase {
  kind: "shape";
  shape: "line" | "rect" | "ellipse";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  width: number;
  fill: boolean;
  opacity: number;
}

export interface TextOp extends OpBase {
  kind: "text";
  x: number;
  y: number;
  text: string;
  font: string;
  size: number;
  color: string;
  opacity: number;
  bold?: boolean;
  italic?: boolean;
}

export type SelectShape =
  | { type: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { type: "ellipse"; x0: number; y0: number; x1: number; y1: number }
  | { type: "lasso"; points: number[] }
  /** The magic wand's result, written down. */
  | { type: "mask"; data: string }
  | { type: "all" }
  | { type: "none" }
  | { type: "invert" };

export interface SelectOp extends OpBase {
  kind: "select";
  mode: Combine;
  shape: SelectShape;
  /**
   * The selection this one adds to, takes from or turns inside out: the one
   * its maker had. Everyone keeps their own, so two people can select at once.
   */
  from?: string | null;
}

/** Everything inside the selection (or the whole layer) taken away. */
export interface ClearOp extends OpBase {
  kind: "clear";
}

/**
 * What is inside the selection (or the whole layer) moved, turned, scaled or
 * flipped. The selection itself stays put; the studio follows a transform with
 * a new selection where the pixels went.
 */
export interface TransformOp extends OpBase {
  kind: "transform";
  /** [a, b, c, d, e, f], as a canvas takes it. */
  m: number[];
}

export interface FilterOp extends OpBase {
  kind: "filter";
  filter: FilterKind;
  amount: number;
}

/** A picture put on a layer: pasted in, or old strokes baked into one. */
export interface ImageOp extends OpBase {
  kind: "image";
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  /** Stands for older ops that were folded into it. */
  baked?: boolean;
}

export type PaintOp = StrokeOp | FillOp | GradientOp | ShapeOp | TextOp | SelectOp | ClearOp | TransformOp | FilterOp | ImageOp;

export const opKind = (op: PaintOp): string => op.kind ?? "stroke";

/** Ops that change which area is selected, rather than what is painted. */
export const changesSelection = (op: PaintOp) => op.kind === "select";

/** The layer an op belongs to. */
export const layerOf = (op: PaintOp, first: string) => op.layer ?? first;

/**
 * An old stroke, put into canvas pixels: its points were fractions of the
 * board and its size was in screen pixels on a board about this wide.
 */
export const LEGACY_BOARD_WIDTH = 440;

export function legacyToDoc(op: StrokeOp, w: number, h: number): StrokeOp {
  if (op.doc || op.kind) return op;
  const points = op.points.map((v, i) => (i % 2 ? v * h : v * w));
  return { ...op, points, size: (op.size * w) / LEGACY_BOARD_WIDTH, doc: true };
}

/** Rounds points to a quarter pixel: a stroke half the size and the same on screen. */
export const trimPoints = (points: number[]) => points.map((v) => Math.round(v * 4) / 4);
