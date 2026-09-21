"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  Blend,
  Brush,
  ClipboardPaste,
  Copy,
  Droplet,
  Eraser,
  FingerprintPattern,
  FlipHorizontal,
  Hand,
  Layers,
  Maximize2,
  Menu,
  Minimize2,
  Minus,
  Move,
  PaintBucket,
  Paintbrush,
  Palette as PaletteIcon,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  Shapes,
  SlidersHorizontal,
  SquareDashed,
  Type,
  Undo2,
  WandSparkles,
  Waves,
  X,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import { encodeGif, type GifFrame } from "@/lib/gif";
import { cssFamily } from "@/lib/fonts";
import { BUILT_IN_BRUSHES, mirrored, stabilize, type BrushMode, type BrushSpec } from "@/lib/studio/brush";
import type { Palette } from "@/lib/studio/color";
import { encodeMask, fullMask, maskBounds, maskEdges, transformMask, type Mask } from "@/lib/studio/mask";
import { trimPoints, type ClearOp, type GradientOp, type PaintOp, type SelectOp, type ShapeOp, type StrokeOp } from "@/lib/studio/ops";
import { exportPicture, opsOn, Studio, type StudioDoc, type StudioLayer } from "@/lib/studio/render";
import { fit, pin, scaleTo, toDoc, viewMatrix, warpCorners, warpMatrix, zoomAt, rotateAt, applyMat, NO_WARP, type Box, type View, type Warp } from "@/lib/studio/view";
import type { FilterKind } from "@/lib/studio/filters";
import type { DoodleState, Item } from "@/lib/types";
import { usePaintOps } from "./use-paint-ops";
import ToolOptions, { DEFAULT_OPTIONS, GENERIC_FONTS, isBrushTool, type BrushTool, type Options, type Tool } from "./tool-options";
import ColorPanel from "./color-panel";
import LayersPanel, { MAX_LAYERS } from "./layers-panel";
import BrushPanel from "./brush-panel";
import FilterPanel from "./filter-panel";
import FilePanel, { type ExportKind } from "./file-panel";
import { IconButton, RailSlider } from "./widgets";

const PAPER = "#faf7f0";
const EMPTY: PaintOp[] = [];
const BROADCAST_MS = 90;
const DEFAULT_LAYERS: StudioLayer[] = [{ id: "base", name: "layer 1", visible: true, opacity: 1 }];

type PanelId = "color" | "layers" | "brushes" | "filters" | "file" | null;

const TOOLS: Array<{ id: Tool; name: string; key: string; icon: React.ReactNode }> = [
  { id: "brush", name: "brush", key: "B", icon: <Paintbrush /> },
  { id: "eraser", name: "eraser", key: "E", icon: <Eraser /> },
  { id: "smudge", name: "smudge", key: "S", icon: <FingerprintPattern /> },
  { id: "blur", name: "blur", key: "R", icon: <Droplet /> },
  { id: "liquify", name: "liquify", key: "L", icon: <Waves /> },
  { id: "fill", name: "fill", key: "G", icon: <PaintBucket /> },
  { id: "gradient", name: "gradient", key: "D", icon: <Blend /> },
  { id: "shape", name: "shapes", key: "U", icon: <Shapes /> },
  { id: "text", name: "text", key: "T", icon: <Type /> },
  { id: "select", name: "select", key: "M", icon: <SquareDashed /> },
  { id: "wand", name: "magic wand", key: "W", icon: <WandSparkles /> },
  { id: "move", name: "move and transform", key: "V", icon: <Move /> },
  { id: "picker", name: "eyedropper", key: "I", icon: <Pipette /> },
  { id: "hand", name: "hand", key: "H", icon: <Hand /> },
];

const KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

const toolForMode = (mode: BrushMode): BrushTool => (mode === "paint" ? "brush" : mode === "erase" ? "eraser" : mode);
const builtIn = (id: string) => BUILT_IN_BRUSHES.find((b) => b.id === id) as BrushSpec;

/** Brush sizes run 1 to 500 along the slider, spread out so the small ones get room. */
const sizeToSlider = (size: number) => Math.round((Math.log(Math.max(1, size)) / Math.log(500)) * 100);
const sliderToSize = (v: number) => Math.max(1, Math.round(Math.exp((v / 100) * Math.log(500))));

function blank(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), "image/png"));

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** The outline of a selection, ready to stroke. */
function edgePath(mask: Mask): Path2D {
  const path = new Path2D();
  const segs = maskEdges(mask);
  for (let i = 0; i < segs.length; i += 4) {
    path.moveTo(segs[i], segs[i + 1]);
    path.lineTo(segs[i + 2], segs[i + 3]);
  }
  return path;
}

/** A layer as its bare pixels, for folding into a picture: its own settings stay on the layer. */
const raw = (layer: StudioLayer): StudioLayer => ({ id: layer.id, name: layer.name, visible: true, opacity: 1 });

/**
 * The picture's size. Boards made before the studio kept their strokes as
 * fractions of the board, so they get a canvas the shape the board was.
 */
function docFor(state: DoodleState, item: Item<"game">): StudioDoc {
  if (state.doc) return state.doc;
  if (state.strokes?.length) {
    const ratio = Math.max(0.25, Math.min(4, (item.height - 84) / Math.max(1, item.width - 16)));
    return { w: 1600, h: Math.round(1600 * ratio), background: PAPER };
  }
  return { w: 1600, h: 1200, background: PAPER };
}

type Gesture =
  | { kind: "pan"; id: number; sx: number; sy: number; view: View }
  | { kind: "pinch"; a: number; b: number; d0: number; a0: number; view: View; doc: [number, number]; at: number; moved: boolean }
  | { kind: "stroke"; id: number; op: StrokeOp; smooth: [number, number]; done: number; paths: number; incremental: boolean; sent: number }
  | { kind: "drag"; id: number; tool: "gradient" | "shape" | "rect" | "ellipse"; mode: SelectOp["mode"]; x0: number; y0: number; x1: number; y1: number; opId: string }
  | { kind: "lasso"; id: number; mode: SelectOp["mode"]; points: number[] }
  | { kind: "warp"; id: number; handle: "move" | "rotate" | [number, number]; start: [number, number]; warp0: Warp; angle0: number };

interface WarpSession {
  layer: string;
  box: Box;
  warp: Warp;
}

export default function StudioBoard({ item, state }: { item: Item<"game">; state: DoodleState }) {
  const { updateData, canEdit, broadcastStroke, liveStrokes, uploadFile, setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);

  // ---------------------------------------------------------------------------
  // The board's shared state
  // ---------------------------------------------------------------------------

  const docW = docFor(state, item).w;
  const docH = docFor(state, item).h;
  const paper = state.doc ? state.doc.background : PAPER;
  const doc = useMemo<StudioDoc>(() => ({ w: docW, h: docH, background: paper }), [docW, docH, paper]);
  const layers = useMemo(() => (state.layers?.length ? state.layers : DEFAULT_LAYERS), [state.layers]);
  const customBrushes = useMemo(() => state.brushes ?? [], [state.brushes]);
  const palettes = useMemo<Palette[]>(() => state.palettes ?? [], [state.palettes]);

  const latestState = useCallback((): DoodleState => {
    const live = useRoomStore.getState().items[item.id];
    const data = live?.data as { game?: string; state?: DoodleState } | undefined;
    return data?.game === "doodle" && data.state ? data.state : state;
  }, [item.id, state]);

  /** Writes to the board, on top of its newest state; the canvas size is pinned the first time. */
  const writeState = useCallback(
    (patch: Partial<DoodleState>) => {
      const current = latestState();
      void updateData(item.id, { game: "doodle", state: { ...current, strokes: current.strokes ?? [], doc: current.doc ?? doc, ...patch } });
    },
    [doc, item.id, latestState, updateData],
  );

  const editItemOps = useCallback((change: (ops: PaintOp[]) => PaintOp[]) => writeState({ strokes: change(latestState().strokes ?? []) }), [latestState, writeState]);

  const { ops, mode, add, remove, replace } = usePaintOps({ itemId: item.id, roomId: item.room_id, itemOps: state.strokes ?? EMPTY, editItemOps });
  const opIds = useMemo(() => new Set(ops.map((op) => op.id)), [ops]);

  // ---------------------------------------------------------------------------
  // What this person has in hand
  // ---------------------------------------------------------------------------

  const [tool, setTool] = useState<Tool>("brush");
  const [specs, setSpecs] = useState<Record<BrushTool, BrushSpec>>(() => ({
    brush: builtIn("pen"),
    eraser: builtIn("eraser"),
    smudge: builtIn("smudge"),
    blur: builtIn("blur"),
    liquify: builtIn("liquify"),
  }));
  const [color, setColor] = useState(() => me?.tint ?? "#1a1420");
  const [second, setSecond] = useState("#ffffff");
  const [recent, setRecent] = useState<string[]>([]);
  const [paintOpacity, setPaintOpacity] = useState(1);
  const [shapeWidth, setShapeWidth] = useState(8);
  const [textSize, setTextSize] = useState(64);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [activeState, setActive] = useState<string | null>(null);
  const [mySelState, setMySel] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const [warping, setWarping] = useState(false);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [filterPreview, setFilterPreview] = useState<{ kind: FilterKind; amount: number } | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; sx: number; sy: number; zoom: number } | null>(null);
  const [text, setText] = useState("");

  const active = layers.find((l) => l.id === activeState) ?? layers[layers.length - 1];
  // A selection someone undid or cleared away is no selection.
  const mySel = mySelState && opIds.has(mySelState) ? mySelState : null;
  const spec = isBrushTool(tool) ? specs[tool] : specs.brush;
  const setOption = (patch: Partial<Options>) => setOptions((o) => ({ ...o, ...patch }));

  const opCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of layers) counts[l.id] = opsOn(ops, layers, l.id).length;
    return counts;
  }, [layers, ops]);

  // ---------------------------------------------------------------------------
  // The engine and the screen
  // ---------------------------------------------------------------------------

  const [imageTick, setImageTick] = useState(0);
  const studio = useMemo(() => new Studio({ w: docW, h: docH, background: null }, () => setImageTick((t) => t + 1)), [docW, docH]);
  const [bus] = useState(() => new EventTarget());

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLCanvasElement>(null);
  const pictureRef = useRef<HTMLCanvasElement | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const filterWorkRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const overlayUsed = useRef(false);
  const viewRef = useRef<View | null>(null);
  const dprRef = useRef(1);
  const gestureRef = useRef<Gesture | null>(null);
  const previewRef = useRef<{ layer: string; canvas: HTMLCanvasElement } | null>(null);
  const previewKind = useRef<"gesture" | "filter" | null>(null);
  const awaitingRef = useRef<string | null>(null);
  const needPrepare = useRef(false);
  const dirtyRef = useRef(true);
  const edgesRef = useRef<{ mask: Mask; path: Path2D } | null>(null);
  const warpRef = useRef<WarpSession | null>(null);
  const cursorRef = useRef<[number, number] | null>(null);
  const touches = useRef(new Map<number, [number, number]>());
  const penSeen = useRef(false);
  const spaceRef = useRef(false);
  const queued = useRef(false);
  const drawRef = useRef<() => void>(() => {});
  const undoRef = useRef<PaintOp[][]>([]);
  const redoRef = useRef<PaintOp[][]>([]);
  const refit = useRef(true);

  const docCanvas = (ref: React.MutableRefObject<HTMLCanvasElement | null>) => {
    if (!ref.current || ref.current.width !== docW || ref.current.height !== docH) ref.current = blank(docW, docH);
    return ref.current;
  };

  const requestDraw = () => {
    if (queued.current) return;
    queued.current = true;
    const run = () => {
      queued.current = false;
      drawRef.current();
    };
    // Frames stop in a hidden page; a timer still comes round, so the picture is never left behind.
    if (document.hidden) setTimeout(run, 16);
    else requestAnimationFrame(run);
  };

  const setView = (v: View) => {
    viewRef.current = v;
    setZoomPct(Math.round(v.zoom * 100));
    requestDraw();
  };

  /**
   * Where a pointer is over the picture, in layout pixels. The board sits in
   * a room that zooms and turns it; offsetX already undoes all of that.
   */
  function local(event: MouseEvent | React.MouseEvent): [number, number] {
    const native = "nativeEvent" in event ? event.nativeEvent : event;
    if (native.target === screenRef.current) return [native.offsetX, native.offsetY];
    const box = boxRef.current;
    if (!box) return [0, 0];
    const rect = box.getBoundingClientRect();
    const k = box.clientWidth / (rect.width || 1);
    return [(native.clientX - rect.left) * k, (native.clientY - rect.top) * k];
  }
  const bumpHistory = () => setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });

  // Everything drawn: bring the layers up to date with the ops.
  useEffect(() => {
    studio.sync(ops, layers);
    const mask = studio.maskOf(mySel);
    if (!mask) edgesRef.current = null;
    else if (edgesRef.current?.mask !== mask) edgesRef.current = { mask, path: edgePath(mask) };
    // The stroke just finished is in the layer now; its preview can go.
    if (awaitingRef.current && ops.some((op) => op.id === awaitingRef.current)) {
      awaitingRef.current = null;
      if (previewKind.current === "gesture" && !gestureRef.current && !warpRef.current) {
        previewRef.current = null;
        previewKind.current = null;
      }
    }
    dirtyRef.current = true;
    requestDraw();
    bus.dispatchEvent(new Event("synced"));
  }, [bus, studio, ops, layers, imageTick, mySel, paper]);

  // Everyone else's strokes while they are still drawing them.
  const live = liveStrokes[item.id];
  useEffect(() => {
    const list = (live ?? []).filter((s) => !opIds.has(s.id) && s.by !== me?.userId && (s.spec ? s.spec.mode === "paint" : s.brush !== "eraser"));
    if (!list.length && !overlayUsed.current) return;
    const o = docCanvas(overlayRef);
    o.getContext("2d")?.clearRect(0, 0, o.width, o.height);
    for (const s of list) studio.apply(o, s, s.layer ?? "base");
    overlayUsed.current = list.length > 0;
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, opIds, studio, me?.userId]);

  // What a filter would do, shown on the layer while the panel is open.
  useEffect(() => {
    if (!filterPreview) {
      if (previewKind.current === "filter") {
        previewRef.current = null;
        previewKind.current = null;
        dirtyRef.current = true;
        requestDraw();
      }
      return;
    }
    const timer = setTimeout(() => {
      const work = docCanvas(filterWorkRef);
      const ctx = work.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, work.width, work.height);
      ctx.drawImage(studio.canvasOf(active.id), 0, 0);
      studio.apply(work, { id: "filter-preview", kind: "filter", filter: filterPreview.kind, amount: filterPreview.amount, sel: mySel }, active.id);
      previewRef.current = { layer: active.id, canvas: work };
      previewKind.current = "filter";
      dirtyRef.current = true;
      requestDraw();
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPreview, active.id, studio, mySel, ops]);

  function dragOp(g: Extract<Gesture, { kind: "drag" }>, preview = false): GradientOp | ShapeOp {
    if (g.tool === "gradient") {
      return { id: preview ? "gradient-preview" : g.opId, kind: "gradient", shape: options.gradientShape, x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, from: color, to: options.gradientFade ? null : second, opacity: paintOpacity, layer: active.id, sel: mySel };
    }
    return { id: preview ? "shape-preview" : g.opId, kind: "shape", shape: options.shape, x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, color, width: shapeWidth, fill: options.shapeFill, opacity: paintOpacity, layer: active.id, sel: mySel };
  }

  /** Lays what is in progress onto a copy of its layer, for the next frame. */
  function prepare() {
    if (!needPrepare.current) return;
    needPrepare.current = false;
    const g = gestureRef.current;
    const session = warpRef.current;
    const work = docCanvas(workRef);
    const ctx = work.getContext("2d");
    if (!ctx) return;
    const fresh = (layer: string) => {
      ctx.clearRect(0, 0, work.width, work.height);
      ctx.drawImage(studio.canvasOf(layer), 0, 0);
    };
    if (g?.kind === "stroke") {
      const layer = g.op.layer as string;
      if (g.incremental) {
        const touched = studio.stroke(work, g.op, g.done);
        g.done += Math.round(touched / g.paths);
      } else {
        fresh(layer);
        studio.stroke(work, g.op);
      }
      previewRef.current = { layer, canvas: work };
    } else if (g?.kind === "drag" && (g.tool === "gradient" || g.tool === "shape")) {
      fresh(active.id);
      studio.apply(work, dragOp(g, true), active.id);
      previewRef.current = { layer: active.id, canvas: work };
    } else if (session) {
      fresh(session.layer);
      studio.apply(work, { id: "warp-preview", kind: "transform", m: warpMatrix(session.box, session.warp), sel: mySel, layer: session.layer }, session.layer);
      previewRef.current = { layer: session.layer, canvas: work };
    } else {
      return;
    }
    previewKind.current = "gesture";
    dirtyRef.current = true;
  }

  const clearPreview = () => {
    if (previewKind.current !== "gesture") return;
    previewRef.current = null;
    previewKind.current = null;
    dirtyRef.current = true;
    requestDraw();
  };

  // The drawing of the screen itself. Rebuilt each render, so it sees what this render sees.
  useEffect(() => {
    drawRef.current = () => {
      const screen = screenRef.current;
      const view = viewRef.current;
      if (!screen || !view) return;
      const ctx = screen.getContext("2d");
      if (!ctx) return;
      const pic = docCanvas(pictureRef);
      prepare();
      if (dirtyRef.current) {
        studio.composite(pic, layers, previewRef.current, paper);
        dirtyRef.current = false;
      }
      // Pixels on the screen per pixel of layout: the display's density times
      // however far the room is zoomed, so the picture stays sharp at any zoom.
      const box = boxRef.current;
      if (box && box.clientWidth) {
        const want = Math.min(4, Math.min(window.devicePixelRatio || 1, 2) * (box.getBoundingClientRect().width / box.clientWidth));
        const w = Math.max(1, Math.round(box.clientWidth * want));
        const h = Math.max(1, Math.round(box.clientHeight * want));
        if (Math.abs(want - dprRef.current) > 0.05 || screen.width !== w || screen.height !== h) {
          dprRef.current = want;
          screen.width = w;
          screen.height = h;
        }
      }
      const dpr = dprRef.current;
      const m = viewMatrix(view);
      const z = view.zoom;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, screen.width, screen.height);
      ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * m[4], dpr * m[5]);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = paper ?? "#ffffff";
      ctx.fillRect(0, 0, docW, docH);
      ctx.restore();
      if (!paper) {
        const cell = Math.max(4, 10 / z);
        ctx.fillStyle = "#d9d6d0";
        for (let y = 0; y < docH; y += cell) {
          for (let x = (Math.round(y / cell) % 2) * cell; x < docW; x += cell * 2) ctx.fillRect(x, y, Math.min(cell, docW - x), Math.min(cell, docH - y));
        }
      }
      ctx.imageSmoothingEnabled = z < 2.5;
      ctx.drawImage(pic, 0, 0);
      if (overlayUsed.current && overlayRef.current) ctx.drawImage(overlayRef.current, 0, 0);

      // Mirror lines, while symmetry is on.
      if (isBrushTool(tool) && options.symmetry !== "none") {
        ctx.save();
        ctx.strokeStyle = "rgba(196,167,240,0.7)";
        ctx.lineWidth = 1 / z;
        ctx.setLineDash([6 / z, 6 / z]);
        const guides = mirrored([docW / 2, -docH, docW / 2, docH * 2], options.symmetry === "horizontal" ? "none" : options.symmetry, docW, docH);
        ctx.beginPath();
        if (options.symmetry === "horizontal" || options.symmetry === "quad") {
          ctx.moveTo(0, docH / 2);
          ctx.lineTo(docW, docH / 2);
        }
        if (options.symmetry !== "horizontal") {
          for (const g of guides) {
            ctx.moveTo(g[0], g[1]);
            ctx.lineTo(g[2], g[3]);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      if (edgesRef.current) {
        ctx.save();
        ctx.lineWidth = 2 / z;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.stroke(edgesRef.current.path);
        ctx.lineWidth = 1 / z;
        ctx.strokeStyle = "#000";
        ctx.setLineDash([5 / z, 4 / z]);
        ctx.stroke(edgesRef.current.path);
        ctx.restore();
      }

      const g = gestureRef.current;
      if (g?.kind === "drag" && (g.tool === "rect" || g.tool === "ellipse" || g.tool === "gradient")) {
        ctx.save();
        ctx.lineWidth = 1.5 / z;
        ctx.strokeStyle = "#fff";
        ctx.setLineDash([5 / z, 4 / z]);
        ctx.beginPath();
        if (g.tool === "rect") ctx.rect(Math.min(g.x0, g.x1), Math.min(g.y0, g.y1), Math.abs(g.x1 - g.x0), Math.abs(g.y1 - g.y0));
        else if (g.tool === "ellipse") ctx.ellipse((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, Math.abs(g.x1 - g.x0) / 2, Math.abs(g.y1 - g.y0) / 2, 0, 0, Math.PI * 2);
        else {
          ctx.moveTo(g.x0, g.y0);
          ctx.lineTo(g.x1, g.y1);
        }
        ctx.stroke();
        ctx.strokeStyle = "#000";
        ctx.lineDashOffset = 4.5 / z;
        ctx.stroke();
        ctx.restore();
      }
      if (g?.kind === "lasso" && g.points.length >= 4) {
        ctx.save();
        ctx.lineWidth = 1.5 / z;
        ctx.strokeStyle = "#fff";
        ctx.setLineDash([5 / z, 4 / z]);
        ctx.beginPath();
        ctx.moveTo(g.points[0], g.points[1]);
        for (let i = 2; i < g.points.length; i += 2) ctx.lineTo(g.points[i], g.points[i + 1]);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // Screen space from here: handles and the brush ring keep their size at any zoom.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const session = warpRef.current;
      if (session) {
        const corners = warpCorners(session.box, session.warp).map(([x, y]) => applyMat(m, x, y));
        ctx.save();
        ctx.strokeStyle = "#c4a7f0";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
        const knob = rotateKnob(corners);
        ctx.beginPath();
        ctx.moveTo((corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2);
        ctx.lineTo(knob[0], knob[1]);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        for (const [x, y] of corners) {
          ctx.fillRect(x - 5, y - 5, 10, 10);
          ctx.strokeRect(x - 5, y - 5, 10, 10);
        }
        ctx.beginPath();
        ctx.arc(knob[0], knob[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = "#c4a7f0";
        ctx.fill();
        ctx.restore();
      }
      const cur = cursorRef.current;
      if (cur && isBrushTool(tool) && g?.kind !== "pan" && g?.kind !== "pinch") {
        const r = Math.max(1.5, (spec.size * z) / 2);
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(cur[0], cur[1], r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.arc(cur[0], cur[1], r + 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };
  });

  // Size the screen to its box, crisp on high-density displays, and fit the picture the first time.
  useEffect(() => {
    const box = boxRef.current;
    const screen = screenRef.current;
    if (!box || !screen) return;
    // Everything here is in layout pixels, which the room's zoom does not change.
    const resize = () => {
      if (refit.current || !viewRef.current) {
        refit.current = false;
        setView(fit({ w: docW, h: docH }, box.clientWidth, box.clientHeight));
      }
      drawRef.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, docW, docH]);

  // The wheel zooms the picture, not the room around it.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const view = viewRef.current;
      if (!view) return;
      const [sx, sy] = local(event);
      if (event.altKey) {
        setView(rotateAt(view, (event.deltaY > 0 ? 1 : -1) * (Math.PI / 24), sx, sy));
        return;
      }
      if (event.shiftKey) {
        setView({ ...view, x: view.x - event.deltaY, y: view.y - event.deltaX });
        return;
      }
      setView(zoomAt(view, Math.exp(-event.deltaY * 0.0022), sx, sy));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // ---------------------------------------------------------------------------
  // Keeping ops
  // ---------------------------------------------------------------------------

  const by = me?.userId;

  const rememberColor = (c: string) => setRecent((r) => [c, ...r.filter((x) => x !== c)].slice(0, 14));

  const commit = async (list: PaintOp[], after?: { sel: string | null }) => {
    if (!canEdit || !list.length) return false;
    const stamped = list.map((op) => ({ ...op, by }));
    undoRef.current.push(stamped);
    if (undoRef.current.length > 200) undoRef.current.shift();
    redoRef.current = [];
    bumpHistory();
    if (after) setMySel(after.sel);
    if (!latestState().doc) writeState({});
    const failed = await add(stamped);
    if (failed) {
      setNotice(`that did not save: ${failed}`);
      undoRef.current = undoRef.current.filter((a) => a !== stamped);
      bumpHistory();
      awaitingRef.current = null;
      clearPreview();
      return false;
    }
    return true;
  };

  const undo = () => {
    if (warpRef.current) {
      endWarp(false);
      return;
    }
    const last = undoRef.current.pop();
    if (!last) return;
    redoRef.current.push(last);
    bumpHistory();
    void remove(last.map((op) => op.id));
    const undone = last.find((op): op is SelectOp => op.kind === "select" && op.id === mySel);
    if (undone) setMySel(undone.from ?? null);
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(next);
    bumpHistory();
    void add(next);
    const selected = [...next].reverse().find((op) => op.kind === "select");
    if (selected) setMySel(selected.id);
  };

  const forgetHistory = () => {
    undoRef.current = [];
    redoRef.current = [];
    bumpHistory();
  };

  /** The layer can take paint, or says why not. */
  const paintable = () => {
    if (!canEdit) return false;
    if (active.locked) {
      setNotice(`"${active.name}" is locked. unlock it in the layers.`);
      return false;
    }
    if (!active.visible) {
      setNotice(`"${active.name}" is hidden. show it to draw on it.`);
      return false;
    }
    return true;
  };

  // ---------------------------------------------------------------------------
  // Selections
  // ---------------------------------------------------------------------------

  const select = (shape: SelectOp["shape"], mode: SelectOp["mode"]) => {
    const op: SelectOp = { id: newId(), kind: "select", mode, shape, from: mode === "replace" && shape.type !== "invert" ? null : mySel };
    void commit([op], { sel: op.id });
  };
  const deselect = () => setMySel(null);
  const selectAll = () => select({ type: "all" }, "replace");
  const invertSelection = () => mySel && select({ type: "invert" }, "replace");
  const clearArea = () => {
    if (!mySel || !paintable()) return;
    void commit([{ id: newId(), kind: "clear", layer: active.id, sel: mySel }]);
  };
  const fillArea = () => {
    if (!mySel || !paintable()) return;
    rememberColor(color);
    void commit([{ id: newId(), kind: "fill", x: 0, y: 0, color, opacity: paintOpacity, tolerance: 0, sample: "layer", grow: 0, region: encodeMask(fullMask(docW, docH)), layer: active.id, sel: mySel }]);
  };

  /** What is selected on this layer, onto a new layer of its own; cut takes it off this one too. */
  const toNewLayer = (cut: boolean) => {
    if (!mySel || !paintable() || layers.length >= MAX_LAYERS) return;
    const layer: StudioLayer = { id: newId(), name: `${active.name} ${cut ? "cut" : "copy"}`.slice(0, 32), visible: true, opacity: 1 };
    const copies = opsOn(ops, layers, active.id).map((op) => ({ ...op, id: newId(), layer: layer.id }));
    const outside: SelectOp = { id: newId(), kind: "select", mode: "replace", shape: { type: "invert" }, from: mySel };
    const list: PaintOp[] = [...copies, outside, { id: newId(), kind: "clear", layer: layer.id, sel: outside.id } as ClearOp];
    if (cut) list.push({ id: newId(), kind: "clear", layer: active.id, sel: mySel });
    const i = layers.findIndex((l) => l.id === active.id);
    writeState({ layers: [...layers.slice(0, i + 1), layer, ...layers.slice(i + 1)] });
    setActive(layer.id);
    void commit(list);
  };

  // ---------------------------------------------------------------------------
  // Move and transform
  // ---------------------------------------------------------------------------

  const beginWarp = (): boolean => {
    if (!paintable()) return false;
    const mask = studio.maskOf(mySel);
    const box = mask ? maskBounds(mask) : studio.bounds(active.id);
    if (!box) {
      setNotice(mask ? "nothing is selected there." : `"${active.name}" has nothing on it to move.`);
      return false;
    }
    warpRef.current = { layer: active.id, box, warp: NO_WARP };
    setWarping(true);
    needPrepare.current = true;
    requestDraw();
    return true;
  };

  const endWarp = (keep: boolean) => {
    const session = warpRef.current;
    warpRef.current = null;
    setWarping(false);
    if (!session) return;
    const w = session.warp;
    const moved = w.tx || w.ty || w.sx !== 1 || w.sy !== 1 || w.rot;
    if (!keep || !moved) {
      clearPreview();
      return;
    }
    const m = warpMatrix(session.box, w);
    const list: PaintOp[] = [{ id: newId(), kind: "transform", m, layer: session.layer, sel: mySel }];
    let after: { sel: string | null } | undefined;
    const mask = studio.maskOf(mySel);
    if (mask) {
      // The selection goes where the pixels went.
      const shifted = transformMask(mask, m);
      const next: SelectOp = { id: newId(), kind: "select", mode: "replace", shape: { type: "mask", data: encodeMask(shifted) }, from: null };
      list.push(next);
      after = { sel: next.id };
    }
    awaitingRef.current = list[0].id;
    void commit(list, after);
  };

  const warpAction = (action: "flipX" | "flipY" | "turn" | "apply" | "cancel") => {
    const session = warpRef.current;
    if (!session) return;
    if (action === "apply") return endWarp(true);
    if (action === "cancel") return endWarp(false);
    const w = session.warp;
    session.warp = action === "flipX" ? { ...w, sx: -w.sx } : action === "flipY" ? { ...w, sy: -w.sy } : { ...w, rot: w.rot + Math.PI / 2 };
    needPrepare.current = true;
    requestDraw();
  };

  const chooseTool = (next: Tool) => {
    if (warpRef.current && next !== "move") endWarp(true);
    setTool(next);
    if (next === "move" && !warpRef.current && canEdit) beginWarp();
  };

  // ---------------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------------

  const pressureOf = (event: { pointerType: string; pressure: number }) => (event.pointerType === "pen" ? Math.max(0.02, event.pressure || 0.5) : 1);

  const startPinch = (at: number) => {
    const [a, b] = [...touches.current.keys()];
    const pa = touches.current.get(a) as [number, number];
    const pb = touches.current.get(b) as [number, number];
    const view = viewRef.current;
    if (!view) return;
    const g = gestureRef.current;
    // A second finger turns a stroke that barely started into a pinch.
    if (g?.kind === "stroke" || g?.kind === "drag" || g?.kind === "lasso") clearPreview();
    const mid: [number, number] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    gestureRef.current = {
      kind: "pinch",
      a,
      b,
      d0: Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1,
      a0: Math.atan2(pb[1] - pa[1], pb[0] - pa[0]),
      view,
      doc: toDoc(view, mid[0], mid[1]),
      at,
      moved: false,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    rootRef.current?.focus({ preventScroll: true });
    if (textDraft) {
      void placeText();
      return;
    }
    const [sx, sy] = local(event);
    if (event.pointerType === "pen") penSeen.current = true;
    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, [sx, sy]);
      if (touches.current.size === 2) {
        startPinch(event.timeStamp);
        return;
      }
      if (touches.current.size > 2) return;
    }
    if (gestureRef.current) return;
    const view = viewRef.current;
    if (!view) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser already let go of; the stroke still works without capture.
    }
    const navigate = event.button === 1 || tool === "hand" || spaceRef.current || (event.pointerType === "touch" && penSeen.current) || (!canEdit && tool !== "picker");
    if (navigate) {
      gestureRef.current = { kind: "pan", id: event.pointerId, sx, sy, view };
      return;
    }
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const [x, y] = toDoc(view, sx, sy);

    if (tool === "picker" || (tool === "brush" && event.altKey)) {
      const picked = studio.pick(layers, x, y, paper);
      if (picked) setColor(picked);
      return;
    }

    if (isBrushTool(tool)) {
      if (!paintable()) return;
      const s = specs[tool];
      const op: StrokeOp = {
        id: newId(),
        kind: "stroke",
        doc: true,
        points: [x, y],
        pressures: [pressureOf(event)],
        color,
        size: s.size,
        spec: s,
        sym: options.symmetry !== "none" ? options.symmetry : undefined,
        atop: active.alphaLock || undefined,
        layer: active.id,
        sel: mySel,
      };
      const incremental = s.mode === "smudge" || s.mode === "blur" || s.mode === "liquify";
      if (incremental) {
        const work = docCanvas(workRef);
        const ctx = work.getContext("2d");
        ctx?.clearRect(0, 0, work.width, work.height);
        ctx?.drawImage(studio.canvasOf(active.id), 0, 0);
      }
      gestureRef.current = { kind: "stroke", id: event.pointerId, op, smooth: [x, y], done: 0, paths: mirrored([0, 0], op.sym, docW, docH).length, incremental, sent: 0 };
      needPrepare.current = true;
      requestDraw();
      return;
    }

    switch (tool) {
      case "fill": {
        if (!paintable()) return;
        let region: string | undefined;
        if (options.fillSample === "all") {
          region = encodeMask(studio.wand(layers, active.id, x, y, options.fillTolerance, true, true));
          if (region.length > 500000) {
            setNotice("that area is too detailed to fill across every layer. try filling from this layer only.");
            return;
          }
        }
        rememberColor(color);
        void commit([
          {
            id: newId(),
            kind: "fill",
            x: Math.floor(x),
            y: Math.floor(y),
            color,
            opacity: paintOpacity,
            tolerance: options.fillTolerance,
            sample: options.fillSample,
            grow: options.fillGrow,
            region,
            layer: active.id,
            sel: mySel,
          },
        ]);
        return;
      }
      case "wand": {
        if (!canEdit) return;
        const mask = studio.wand(layers, active.id, x, y, options.wandTolerance, options.wandSample === "all", options.wandContiguous);
        const data = encodeMask(mask);
        if (data.length > 500000) {
          setNotice("that selection is too detailed to keep. try a lower tolerance.");
          return;
        }
        select({ type: "mask", data }, event.shiftKey ? "add" : event.altKey ? "subtract" : options.selectMode);
        return;
      }
      case "gradient":
      case "shape":
        if (!paintable()) return;
        gestureRef.current = { kind: "drag", id: event.pointerId, tool, mode: "replace", x0: x, y0: y, x1: x, y1: y, opId: newId() };
        needPrepare.current = true;
        requestDraw();
        return;
      case "select": {
        if (!canEdit) return;
        const mode = event.shiftKey ? "add" : event.altKey ? "subtract" : options.selectMode;
        gestureRef.current =
          options.selectShape === "lasso"
            ? { kind: "lasso", id: event.pointerId, mode, points: [x, y] }
            : { kind: "drag", id: event.pointerId, tool: options.selectShape, mode, x0: x, y0: y, x1: x, y1: y, opId: newId() };
        return;
      }
      case "text":
        if (!paintable()) return;
        setText("");
        setTextDraft({ x, y, sx, sy, zoom: view.zoom });
        return;
      case "move": {
        if (!warpRef.current && !beginWarp()) return;
        const session = warpRef.current as WarpSession;
        const m = viewMatrix(view);
        const corners = warpCorners(session.box, session.warp).map(([cx, cy]) => applyMat(m, cx, cy));
        const knob = rotateKnob(corners);
        const near = (p: [number, number]) => Math.hypot(p[0] - sx, p[1] - sy) < 14;
        const signs: Array<[number, number]> = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ];
        const corner = corners.findIndex(near);
        const center = applyMat(m, ...applyMat(warpMatrix(session.box, session.warp), session.box.x + session.box.w / 2, session.box.y + session.box.h / 2));
        gestureRef.current = {
          kind: "warp",
          id: event.pointerId,
          handle: near(knob) ? "rotate" : corner >= 0 ? signs[corner] : "move",
          start: [x, y],
          warp0: session.warp,
          angle0: Math.atan2(sy - center[1], sx - center[0]),
        };
        return;
      }
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(event);
    if (event.pointerType !== "touch") {
      cursorRef.current = [sx, sy];
      if (isBrushTool(tool)) requestDraw();
    }
    if (event.pointerType === "touch" && touches.current.has(event.pointerId)) touches.current.set(event.pointerId, [sx, sy]);
    const g = gestureRef.current;
    if (!g) return;
    const view = viewRef.current;
    if (!view) return;

    if (g.kind === "pinch") {
      const pa = touches.current.get(g.a);
      const pb = touches.current.get(g.b);
      if (!pa || !pb) return;
      const d = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      const angle = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
      const mid: [number, number] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
      if (Math.abs(d - g.d0) > 8 || Math.abs(angle - g.a0) > 0.08) g.moved = true;
      let rot = g.view.rot + (angle - g.a0);
      // Snaps straight when it is nearly straight.
      const quarter = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(rot - quarter) < 0.06) rot = quarter;
      const zoom = Math.max(0.05, Math.min(32, g.view.zoom * (d / g.d0)));
      setView(pin({ ...g.view, zoom, rot }, g.doc[0], g.doc[1], mid[0], mid[1]));
      return;
    }
    if (g.id !== event.pointerId) return;
    if (event.buttons === 0 && event.pointerType === "mouse") {
      onPointerUp(event);
      return;
    }

    if (g.kind === "pan") {
      setView({ ...g.view, x: g.view.x + (sx - g.sx), y: g.view.y + (sy - g.sy) });
      return;
    }
    const [x, y] = toDoc(view, sx, sy);

    if (g.kind === "stroke") {
      const native = event.nativeEvent;
      const samples = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
      const list = samples.length ? samples : [native];
      for (const e of list) {
        const [ex, ey] = local(e);
        const p = toDoc(view, ex, ey);
        g.smooth = stabilize(g.smooth, p, options.stabilizer);
        g.op.points.push(g.smooth[0], g.smooth[1]);
        g.op.pressures?.push(pressureOf(e));
      }
      needPrepare.current = true;
      requestDraw();
      if (event.timeStamp - g.sent >= BROADCAST_MS && g.op.spec?.mode === "paint") {
        g.sent = event.timeStamp;
        broadcastStroke(item.id, { ...g.op, by, points: g.op.points.slice(), pressures: g.op.pressures?.slice() });
      }
      return;
    }
    if (g.kind === "drag") {
      let x1 = x;
      let y1 = y;
      if (event.shiftKey) {
        if (g.tool === "shape" && options.shape === "line") {
          // Snapped to every 15 degrees.
          const a = Math.round(Math.atan2(y - g.y0, x - g.x0) / (Math.PI / 12)) * (Math.PI / 12);
          const len = Math.hypot(x - g.x0, y - g.y0);
          x1 = g.x0 + Math.cos(a) * len;
          y1 = g.y0 + Math.sin(a) * len;
        } else if (g.tool !== "gradient") {
          const side = Math.max(Math.abs(x - g.x0), Math.abs(y - g.y0));
          x1 = g.x0 + Math.sign(x - g.x0 || 1) * side;
          y1 = g.y0 + Math.sign(y - g.y0 || 1) * side;
        }
      }
      g.x1 = x1;
      g.y1 = y1;
      if (g.tool === "gradient" || g.tool === "shape") needPrepare.current = true;
      requestDraw();
      return;
    }
    if (g.kind === "lasso") {
      const n = g.points.length;
      if (Math.hypot(x - g.points[n - 2], y - g.points[n - 1]) * view.zoom >= 3) g.points.push(x, y);
      requestDraw();
      return;
    }
    if (g.kind === "warp") {
      const session = warpRef.current;
      if (!session) return;
      if (g.handle === "move") {
        session.warp = { ...g.warp0, tx: g.warp0.tx + (x - g.start[0]), ty: g.warp0.ty + (y - g.start[1]) };
      } else if (g.handle === "rotate") {
        const m = viewMatrix(view);
        const center = applyMat(m, ...applyMat(warpMatrix(session.box, g.warp0), session.box.x + session.box.w / 2, session.box.y + session.box.h / 2));
        let rot = g.warp0.rot + Math.atan2(sy - center[1], sx - center[0]) - g.angle0;
        if (event.shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12);
        session.warp = { ...g.warp0, rot };
      } else {
        session.warp = scaleTo(session.box, g.warp0, x, y, g.handle, event.shiftKey);
      }
      needPrepare.current = true;
      requestDraw();
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const wasTouch = event.pointerType === "touch" && touches.current.delete(event.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (!wasTouch) return;
      gestureRef.current = null;
      // Two fingers tapped together: undo, as drawing apps do.
      if (!g.moved && event.timeStamp - g.at < 280 && canEdit) undo();
      return;
    }
    if (g.id !== event.pointerId) return;
    gestureRef.current = null;
    const view = viewRef.current;

    if (g.kind === "stroke") {
      const op = g.op;
      if (view && event.type === "pointerup") {
        const [x, y] = toDoc(view, ...local(event));
        const n = op.points.length;
        if (Math.hypot(x - op.points[n - 2], y - op.points[n - 1]) > 0.5) {
          op.points.push(x, y);
          op.pressures?.push(op.pressures[op.pressures.length - 1] ?? 1);
        }
      }
      if (event.type === "pointercancel") {
        clearPreview();
        return;
      }
      const done: StrokeOp = { ...op, points: trimPoints(op.points), pressures: op.pressures?.map((p) => Math.round(p * 100) / 100) };
      needPrepare.current = true;
      awaitingRef.current = done.id;
      if (op.spec?.mode === "paint") rememberColor(color);
      void commit([done]);
      return;
    }
    if (g.kind === "drag") {
      const size = Math.hypot(g.x1 - g.x0, g.y1 - g.y0) * (view?.zoom ?? 1);
      if (g.tool === "gradient" || g.tool === "shape") {
        if (size < 3) {
          clearPreview();
          return;
        }
        awaitingRef.current = g.opId;
        rememberColor(color);
        void commit([dragOp(g)]);
        return;
      }
      if (size < 3) {
        if (g.mode === "replace") deselect();
        requestDraw();
        return;
      }
      const shape = { type: g.tool, x0: Math.min(g.x0, g.x1), y0: Math.min(g.y0, g.y1), x1: Math.max(g.x0, g.x1), y1: Math.max(g.y0, g.y1) } as SelectOp["shape"];
      select(shape, g.mode);
      requestDraw();
      return;
    }
    if (g.kind === "lasso") {
      if (g.points.length >= 6) select({ type: "lasso", points: trimPoints(g.points) }, g.mode);
      else if (g.mode === "replace") deselect();
      requestDraw();
    }
  };

  const onPointerLeave = () => {
    cursorRef.current = null;
    requestDraw();
  };

  // ---------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------

  const fontString = (family: string) => (GENERIC_FONTS.includes(family) ? family : `${cssFamily(family)}, sans-serif`);

  const placeText = async () => {
    const draft = textDraft;
    setTextDraft(null);
    if (!draft || !text.trim()) return;
    const font = fontString(options.font);
    try {
      await document.fonts.load(`${options.bold ? "700 " : ""}${textSize}px ${font}`);
    } catch {
      // Drawn with whatever there is.
    }
    rememberColor(color);
    const id = newId();
    awaitingRef.current = id;
    void commit([{ id, kind: "text", x: draft.x, y: draft.y, text: text.slice(0, 2000), font, size: textSize, color, opacity: paintOpacity, bold: options.bold || undefined, italic: options.italic || undefined, layer: active.id, sel: mySel }]);
  };

  // ---------------------------------------------------------------------------
  // Layers
  // ---------------------------------------------------------------------------

  const writeLayers = (next: StudioLayer[]) => writeState({ layers: next });

  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    const layer: StudioLayer = { id: newId(), name: `layer ${layers.length + 1}`, visible: true, opacity: 1 };
    const i = layers.findIndex((l) => l.id === active.id);
    writeLayers([...layers.slice(0, i + 1), layer, ...layers.slice(i + 1)]);
    setActive(layer.id);
  };

  const duplicateLayer = (id: string) => {
    const source = layers.find((l) => l.id === id);
    if (!source || layers.length >= MAX_LAYERS) return;
    const layer: StudioLayer = { ...source, id: newId(), name: `${source.name} copy`.slice(0, 32) };
    const copies = opsOn(ops, layers, id).map((op) => ({ ...op, id: newId(), layer: layer.id }));
    const i = layers.findIndex((l) => l.id === id);
    writeLayers([...layers.slice(0, i + 1), layer, ...layers.slice(i + 1)]);
    setActive(layer.id);
    if (copies.length) void commit(copies);
  };

  const deleteLayer = (id: string) => {
    if (layers.length <= 1) return;
    const gone = opsOn(ops, layers, id).map((op) => op.id);
    const next = layers.filter((l) => l.id !== id);
    writeLayers(next);
    if (active.id === id) setActive(next[Math.max(0, layers.findIndex((l) => l.id === id) - 1)].id);
    void remove(gone);
    forgetHistory();
  };

  const clearLayer = (id: string) => {
    const layer = layers.find((l) => l.id === id);
    if (!canEdit || !layer || layer.locked) return;
    void commit([{ id: newId(), kind: "clear", layer: id, sel: mySel }]);
  };

  /** Layers turned into pictures, their history folded away: for merging, and for boards with a long past. */
  const fold = async (jobs: Array<{ into: StudioLayer; from: StudioLayer[] }>, label: string) => {
    setBusy(label);
    try {
      const next: PaintOp[] = [];
      const gone: string[] = [];
      for (const job of jobs) {
        const own = job.from.flatMap((l) => opsOn(ops, layers, l.id));
        if (!own.length) continue;
        gone.push(...own.map((op) => op.id));
        const c = blank(docW, docH);
        studio.composite(c, job.from.map((l, i) => (i === 0 ? raw(l) : { ...l, visible: true })), null, null);
        const empty = job.from.every((l) => !studio.bounds(l.id));
        if (empty) continue;
        const blob = await toBlob(c);
        if (!blob) throw new Error("the picture could not be made");
        const url = await uploadFile(new File([blob], "layer.png", { type: "image/png" }));
        if (!url) throw new Error("the picture could not be uploaded");
        await loadImage(url).catch(() => null);
        next.push({ id: newId(), kind: "image", layer: job.into.id, url, x: 0, y: 0, w: docW, h: docH, baked: true, by });
      }
      const failed = await replace(gone, next);
      if (failed) throw new Error(failed);
      forgetHistory();
      return true;
    } catch (error) {
      setNotice(`that did not work: ${(error as Error).message}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const mergeDown = async (id: string) => {
    const i = layers.findIndex((l) => l.id === id);
    if (i <= 0) return;
    const upper = layers[i];
    const lower = layers[i - 1];
    const ok = await fold([{ into: lower, from: [lower, upper] }], "merging the layers");
    if (!ok) return;
    writeLayers(layers.filter((l) => l.id !== upper.id));
    setActive(lower.id);
  };

  const bakeAll = () => void fold(layers.map((l) => ({ into: l, from: [l] })), "folding the history into pictures");

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  const exportAs = async (kind: ExportKind) => {
    const blob = await exportPicture(studio, layers, paper, kind === "png2x" ? "png" : kind, kind === "png2x" ? 2 : 1);
    if (blob) saveFile(blob, `nook-paint-${stamp()}.${kind === "jpeg" ? "jpg" : "png"}`);
  };

  const timelapse = async () => {
    if (!ops.length || busy) return;
    setBusy("making the timelapse");
    try {
      const k = Math.min(1, 480 / Math.max(docW, docH));
      const w = Math.max(1, Math.round(docW * k));
      const h = Math.max(1, Math.round(docH * k));
      const replay = new Studio({ w: docW, h: docH, background: null });
      // Start any pictures loading before the frames need them.
      if (ops.some((op) => op.kind === "image")) {
        replay.sync(ops, layers);
        await new Promise((r) => setTimeout(r, 800));
        replay.reset();
      }
      const full = blank(docW, docH);
      const small = blank(w, h);
      const sctx = small.getContext("2d", { willReadFrequently: true });
      if (!sctx) return;
      const steps = Math.min(30, ops.length);
      const frames: GifFrame[] = [];
      for (let i = 1; i <= steps; i += 1) {
        replay.sync(ops.slice(0, Math.ceil((ops.length * i) / steps)), layers);
        replay.composite(full, layers, null, paper ?? "#ffffff");
        sctx.clearRect(0, 0, w, h);
        sctx.drawImage(full, 0, 0, w, h);
        frames.push({ data: sctx.getImageData(0, 0, w, h).data, delayMs: i === steps ? 1500 : 100 });
        await new Promise((r) => setTimeout(r, 0));
      }
      const bytes = encodeGif(frames, w, h);
      saveFile(new Blob([bytes.buffer as ArrayBuffer], { type: "image/gif" }), `nook-paint-${stamp()}.gif`);
    } finally {
      setBusy(null);
    }
  };

  const saveProject = () => {
    const project = { nook: "paint", version: 1, doc, layers, brushes: customBrushes, palettes, ops };
    saveFile(new Blob([JSON.stringify(project)], { type: "application/json" }), `nook-paint-${stamp()}.json`);
  };

  const openProject = async (file: File) => {
    let data: { nook?: string; doc?: StudioDoc; layers?: StudioLayer[]; brushes?: BrushSpec[]; palettes?: Palette[]; ops?: PaintOp[] };
    try {
      data = JSON.parse(await file.text());
    } catch {
      setNotice("that file is not a project this board can open.");
      return;
    }
    if (data?.nook !== "paint" || !Array.isArray(data.ops) || !data.doc || !Array.isArray(data.layers) || !data.layers.length) {
      setNotice("that file is not a nook paint project.");
      return;
    }
    setBusy("opening the project");
    // Fresh ids, so the same project can be opened on two boards.
    const ids = new Map(data.ops.map((op) => [op.id, newId()]));
    const fresh = data.ops.slice(0, 5000).map((op) => {
      const next = { ...op, id: ids.get(op.id) as string, by } as PaintOp;
      if (op.sel) next.sel = ids.get(op.sel) ?? null;
      if (op.kind === "select" && op.from) (next as SelectOp).from = ids.get(op.from) ?? null;
      return next;
    });
    const nextDoc: StudioDoc = {
      w: Math.max(16, Math.min(4096, Math.round(Number(data.doc.w) || 1600))),
      h: Math.max(16, Math.min(4096, Math.round(Number(data.doc.h) || 1200))),
      background: typeof data.doc.background === "string" ? data.doc.background : null,
    };
    const failed = await replace(
      ops.map((op) => op.id),
      fresh,
    );
    setBusy(null);
    if (failed) {
      setNotice(`the project did not open: ${failed}`);
      return;
    }
    writeState({
      doc: nextDoc,
      layers: data.layers.slice(0, MAX_LAYERS).map((l) => ({ ...l, id: String(l.id), name: String(l.name ?? "layer").slice(0, 32), visible: l.visible !== false, opacity: Number(l.opacity ?? 1) })),
      ...(Array.isArray(data.brushes) ? { brushes: data.brushes.slice(0, 40) } : {}),
      ...(Array.isArray(data.palettes) ? { palettes: data.palettes.slice(0, 20) } : {}),
    });
    setActive(null);
    setMySel(null);
    forgetHistory();
    refit.current = true;
  };

  const importImage = async (file: File) => {
    if (!canEdit || layers.length >= MAX_LAYERS) return;
    setBusy("bringing the picture in");
    try {
      const url = await uploadFile(file);
      if (!url) return;
      const img = await loadImage(url);
      const k = Math.min(1, (docW * 0.9) / img.naturalWidth, (docH * 0.9) / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      const layer: StudioLayer = { id: newId(), name: (file.name.replace(/\.[^.]+$/, "") || "picture").slice(0, 32), visible: true, opacity: 1 };
      const i = layers.findIndex((l) => l.id === active.id);
      writeLayers([...layers.slice(0, i + 1), layer, ...layers.slice(i + 1)]);
      setActive(layer.id);
      void commit([{ id: newId(), kind: "image", layer: layer.id, url, x: (docW - w) / 2, y: (docH - h) / 2, w, h }]);
    } catch {
      setNotice("that picture could not be opened.");
    } finally {
      setBusy(null);
    }
  };

  const clearAll = () => {
    void remove(ops.map((op) => op.id));
    writeState({ strokes: [], layers: DEFAULT_LAYERS });
    setActive(null);
    setMySel(null);
    forgetHistory();
  };

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  const setBrushSize = (size: number) => {
    const t = isBrushTool(tool) ? tool : "brush";
    setSpecs((s) => ({ ...s, [t]: { ...s[t], size: Math.max(1, Math.min(500, size)) } }));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    const el = event.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
    const mod = event.ctrlKey || event.metaKey;
    const k = event.key.toLowerCase();
    if (mod) {
      const act: Record<string, () => void> = {
        z: () => (event.shiftKey ? redo() : undo()),
        y: redo,
        d: deselect,
        a: selectAll,
        i: () => event.shiftKey && invertSelection(),
        s: saveProject,
        0: () => setView(fit({ w: docW, h: docH }, boxRef.current?.clientWidth ?? 400, boxRef.current?.clientHeight ?? 300)),
      };
      if (act[k]) {
        event.preventDefault();
        act[k]();
      }
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      spaceRef.current = true;
      return;
    }
    if (event.key === "Enter" && warpRef.current) return endWarp(true);
    if (event.key === "Escape") {
      if (warpRef.current) endWarp(false);
      else if (panel) setPanel(null);
      else if (mySel) deselect();
      else if (expanded) setExpanded(false);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && mySel) {
      event.preventDefault();
      clearArea();
      return;
    }
    if (event.key === "[") return setBrushSize(Math.round(spec.size / 1.2));
    if (event.key === "]") return setBrushSize(Math.round(spec.size * 1.2) + 1);
    if (k === "x") {
      setColor(second);
      setSecond(color);
      return;
    }
    const view = viewRef.current;
    const box = boxRef.current;
    if ((k === "=" || k === "+" || k === "-") && view && box) {
      setView(zoomAt(view, k === "-" ? 1 / 1.25 : 1.25, box.clientWidth / 2, box.clientHeight / 2));
      return;
    }
    if (KEYS[k]) chooseTool(KEYS[k]);
  };

  const onKeyUp = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === " ") spaceRef.current = false;
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const file = [...event.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void importImage(file);
  };

  // ---------------------------------------------------------------------------
  // Rails
  // ---------------------------------------------------------------------------

  const railSize = isBrushTool(tool) ? spec.size : tool === "shape" ? shapeWidth : tool === "text" ? textSize : null;
  const setRailSize = (v: number) => {
    if (isBrushTool(tool)) setBrushSize(v);
    else if (tool === "shape") setShapeWidth(v);
    else if (tool === "text") setTextSize(v);
  };
  const railOpacity = isBrushTool(tool) ? spec.opacity : paintOpacity;
  const setRailOpacity = (v: number) => {
    if (isBrushTool(tool)) setSpecs((s) => ({ ...s, [tool]: { ...s[tool], opacity: Math.max(0.01, v) } }));
    else setPaintOpacity(Math.max(0.01, v));
  };

  const pickBrush = (b: BrushSpec) => {
    const t = toolForMode(b.mode);
    setSpecs((s) => ({ ...s, [t]: b }));
    chooseTool(t);
  };

  const togglePanel = (p: PanelId) => setPanel((current) => (current === p ? null : p));

  const cursor = tool === "hand" ? "grab" : tool === "move" ? "move" : tool === "text" ? "text" : isBrushTool(tool) ? "none" : "crosshair";
  const empty = ops.length === 0;

  const body = (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPaste={onPaste}
      onPointerDown={(event) => expanded && event.stopPropagation()}
      className={clsx(
        "flex flex-col overflow-hidden text-chalk outline-none select-none",
        expanded ? "fixed inset-0 z-[70] bg-ink-900" : "surface grain relative size-full rounded-2xl",
      )}
    >
      {/* Top: file, history, what the tool does, the view. */}
      {/* Kept clear of the corners, where the table's resize handles sit. */}
      <div className={clsx("no-scrollbar relative z-10 flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/8", expanded ? "px-1.5" : "px-7")}>
        <IconButton label="file" onClick={() => togglePanel("file")} active={panel === "file"}>
          <Menu />
        </IconButton>
        <IconButton label="undo (ctrl z, or tap with two fingers)" onClick={undo} disabled={!canEdit || (!history.undo && !warping)}>
          <Undo2 />
        </IconButton>
        <IconButton label="redo (ctrl shift z)" onClick={redo} disabled={!canEdit || !history.redo}>
          <Redo2 />
        </IconButton>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />
        <ToolOptions tool={tool} spec={spec} options={options} set={setOption} warping={warping} onBrushes={() => togglePanel("brushes")} onWarp={warpAction} />
        <span className="min-w-2 flex-1" />
        <IconButton
          label="zoom out"
          onClick={() => {
            const v = viewRef.current;
            const box = boxRef.current;
            if (v && box) setView(zoomAt(v, 1 / 1.25, box.clientWidth / 2, box.clientHeight / 2));
          }}
        >
          <Minus />
        </IconButton>
        <button
          type="button"
          title="fit the picture (ctrl 0)"
          onClick={() => {
            const box = boxRef.current;
            if (box) setView(fit({ w: docW, h: docH }, box.clientWidth, box.clientHeight));
          }}
          className="min-h-7 shrink-0 rounded-md px-1.5 text-[10px] text-muted tabular-nums hover:bg-white/8 hover:text-chalk"
        >
          {zoomPct}%
        </button>
        <IconButton
          label="zoom in"
          onClick={() => {
            const v = viewRef.current;
            const box = boxRef.current;
            if (v && box) setView(zoomAt(v, 1.25, box.clientWidth / 2, box.clientHeight / 2));
          }}
        >
          <Plus />
        </IconButton>
        <IconButton
          label="turn the view left (alt and the wheel)"
          onClick={() => {
            const v = viewRef.current;
            const box = boxRef.current;
            if (v && box) setView(rotateAt(v, -Math.PI / 12, box.clientWidth / 2, box.clientHeight / 2));
          }}
        >
          <RotateCcw />
        </IconButton>
        <IconButton
          label="turn the view right"
          onClick={() => {
            const v = viewRef.current;
            const box = boxRef.current;
            if (v && box) setView(rotateAt(v, Math.PI / 12, box.clientWidth / 2, box.clientHeight / 2));
          }}
        >
          <RotateCw />
        </IconButton>
        <IconButton
          label="mirror the view (the picture stays as it is)"
          onClick={() => {
            const v = viewRef.current;
            const box = boxRef.current;
            if (!v || !box) return;
            const [dx, dy] = toDoc(v, box.clientWidth / 2, box.clientHeight / 2);
            setView(pin({ ...v, flip: !v.flip }, dx, dy, box.clientWidth / 2, box.clientHeight / 2));
          }}
        >
          <FlipHorizontal />
        </IconButton>
        <IconButton
          label={expanded ? "back to the table" : "full screen"}
          onClick={() => {
            refit.current = true;
            setExpanded((v) => !v);
          }}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </IconButton>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Tools */}
        <div className="no-scrollbar flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/8 p-1">
          {TOOLS.map((t) => (
            <IconButton key={t.id} label={`${t.name} (${t.key})`} active={tool === t.id} onClick={() => chooseTool(t.id)} disabled={!canEdit && t.id !== "hand" && t.id !== "picker"}>
              {t.icon}
            </IconButton>
          ))}
        </div>

        {/* The picture */}
        <div
          ref={boxRef}
          className="relative min-w-0 flex-1 overflow-hidden bg-[#26212c]"
          onDragOver={(event) => {
            if ([...event.dataTransfer.items].some((i) => i.kind === "file")) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onDrop={(event) => {
            const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
            if (!file) return;
            event.preventDefault();
            event.stopPropagation();
            void importImage(file);
          }}
        >
          <canvas
            ref={screenRef}
            className="absolute inset-0 size-full touch-none"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onContextMenu={(event) => event.preventDefault()}
          />

          {textDraft && (
            <div className="absolute z-10" style={{ left: textDraft.sx, top: textDraft.sy }} onPointerDown={(event) => event.stopPropagation()}>
              <textarea
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") setTextDraft(null);
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void placeText();
                }}
                placeholder="type..."
                rows={Math.max(1, text.split("\n").length)}
                className="min-w-24 resize-none border border-dashed border-glow/70 bg-transparent p-0 leading-[1.2] outline-none"
                style={{
                  color,
                  opacity: paintOpacity,
                  fontFamily: fontString(options.font),
                  fontSize: textSize * textDraft.zoom,
                  fontWeight: options.bold ? 700 : 400,
                  fontStyle: options.italic ? "italic" : "normal",
                  width: `${Math.max(6, ...text.split("\n").map((l) => l.length + 2))}ch`,
                }}
              />
              <div className="mt-1 flex gap-1">
                <button type="button" onClick={() => void placeText()} className="rounded-md bg-glow/30 px-2 py-1 text-[10px] font-semibold text-glow">
                  place it
                </button>
                <button type="button" onClick={() => setTextDraft(null)} className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-muted">
                  cancel
                </button>
              </div>
            </div>
          )}

          {mySel && canEdit && (
            <div
              className="surface-raised absolute bottom-2 left-1/2 z-10 flex max-w-[96%] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl p-1 shadow-xl no-scrollbar"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <SelButton onClick={deselect} icon={<X />}>
                deselect
              </SelButton>
              <SelButton onClick={invertSelection}>invert</SelButton>
              <SelButton onClick={selectAll}>all</SelButton>
              <SelButton onClick={clearArea}>clear</SelButton>
              <SelButton onClick={fillArea}>fill</SelButton>
              <SelButton onClick={() => toNewLayer(false)} icon={<Copy />}>
                copy to layer
              </SelButton>
              <SelButton onClick={() => toNewLayer(true)} icon={<Scissors />}>
                cut to layer
              </SelButton>
              <SelButton onClick={() => chooseTool("move")} icon={<Move />}>
                transform
              </SelButton>
              <SelButton onClick={() => togglePanel("filters")} icon={<SlidersHorizontal />}>
                filter
              </SelButton>
            </div>
          )}

          {panel === "color" && (
            <ColorPanel
              color={color}
              second={second}
              recent={recent}
              palettes={palettes}
              canEdit={canEdit}
              onColor={setColor}
              onSwap={() => {
                setColor(second);
                setSecond(color);
              }}
              onPalettes={(next) => writeState({ palettes: next.slice(0, 20) })}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "layers" && (
            <LayersPanel
              studio={studio}
              bus={bus}
              layers={layers}
              active={active.id}
              paper={paper}
              canEdit={canEdit}
              opCounts={opCounts}
              onSelect={(id) => {
                if (warpRef.current) endWarp(true);
                setActive(id);
              }}
              onChange={writeLayers}
              onAdd={addLayer}
              onDuplicate={duplicateLayer}
              onMergeDown={(id) => void mergeDown(id)}
              onDelete={deleteLayer}
              onClear={clearLayer}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "brushes" && (
            <BrushPanel
              spec={spec}
              color={color}
              custom={customBrushes}
              canEdit={canEdit}
              onPick={pickBrush}
              onSpec={pickBrush}
              onCustom={(next) => writeState({ brushes: next.slice(0, 40) })}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "filters" && (
            <FilterPanel
              selected={Boolean(mySel)}
              canEdit={canEdit}
              onPreview={setFilterPreview}
              onApply={(kind, amount) => {
                if (!paintable()) return;
                void commit([{ id: newId(), kind: "filter", filter: kind, amount, layer: active.id, sel: mySel }]);
              }}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "file" && (
            <FilePanel
              doc={{ w: docW, h: docH }}
              paper={paper}
              empty={empty}
              opCount={ops.length}
              mode={mode}
              busy={busy}
              canEdit={canEdit}
              onExport={(kind) => void exportAs(kind)}
              onGif={() => void timelapse()}
              onSaveProject={saveProject}
              onOpenProject={(file) => void openProject(file)}
              onImportImage={(file) => void importImage(file)}
              onPaper={(c) => writeState({ doc: { w: docW, h: docH, background: c } })}
              onSize={(w, h) => {
                refit.current = true;
                writeState({ doc: { w, h, background: paper } });
              }}
              onBake={bakeAll}
              onClearAll={clearAll}
              onClose={() => setPanel(null)}
            />
          )}

          {busy && panel !== "file" && (
            <p className="surface-raised absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-lg px-2.5 py-1 text-[11px] text-chalk">{busy}...</p>
          )}
          {mode === "loading" && <p className="absolute top-2 left-2 text-[10px] text-muted">opening the picture...</p>}
        </div>

        {/* Right rail: the colour, size and opacity, and the panels. */}
        <div className="no-scrollbar flex w-12 shrink-0 flex-col items-center gap-2 overflow-y-auto border-l border-white/8 py-1.5">
          <button type="button" onClick={() => togglePanel("color")} className="relative size-9 shrink-0" title="colour" aria-label="colour">
            <span className="absolute right-0 bottom-0 size-5 rounded ring-1 ring-white/30" style={{ background: second }} />
            <span className={clsx("absolute top-0 left-0 size-7 rounded-md ring-2", panel === "color" ? "ring-glow" : "ring-white/40")} style={{ background: color }} />
          </button>
          {railSize !== null && <RailSlider label="size" value={sizeToSlider(railSize)} min={0} max={100} onChange={(v) => setRailSize(sliderToSize(v))} display={`${Math.round(railSize)}`} />}
          <RailSlider label="opac" value={Math.round(railOpacity * 100)} min={1} max={100} onChange={(v) => setRailOpacity(v / 100)} display={`${Math.round(railOpacity * 100)}%`} />
          <IconButton label="brushes" onClick={() => togglePanel("brushes")} active={panel === "brushes"}>
            <Brush />
          </IconButton>
          <IconButton label="layers" onClick={() => togglePanel("layers")} active={panel === "layers"}>
            <Layers />
          </IconButton>
          <IconButton label="filters" onClick={() => togglePanel("filters")} active={panel === "filters"} disabled={!canEdit}>
            <SlidersHorizontal />
          </IconButton>
          <IconButton label="palettes" onClick={() => togglePanel("color")} active={panel === "color"}>
            <PaletteIcon />
          </IconButton>
          <IconButton label="paste a picture as a layer (ctrl v)" onClick={() => void pasteFromClipboard(importImage, setNotice)} disabled={!canEdit}>
            <ClipboardPaste />
          </IconButton>
        </div>
      </div>
    </div>
  );

  return expanded ? createPortal(body, document.body) : body;
}

/** The knob that turns the transform: out from the middle of the top edge. */
function rotateKnob(corners: Array<[number, number]>): [number, number] {
  const top: [number, number] = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
  const bottom: [number, number] = [(corners[2][0] + corners[3][0]) / 2, (corners[2][1] + corners[3][1]) / 2];
  const dx = top[0] - bottom[0];
  const dy = top[1] - bottom[1];
  const len = Math.hypot(dx, dy) || 1;
  return [top[0] + (dx / len) * 26, top[1] + (dy / len) * 26];
}

async function pasteFromClipboard(importImage: (file: File) => Promise<void>, notice: (message: string) => void) {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      await importImage(new File([blob], `pasted.${type.split("/")[1]}`, { type }));
      return;
    }
    notice("there is no picture on the clipboard.");
  } catch {
    notice("the clipboard could not be read here. ctrl v works too.");
  }
}

function SelButton({ onClick, children, icon }: { onClick: () => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] whitespace-nowrap text-muted hover:bg-white/8 hover:text-chalk [&_svg]:size-3">
      {icon}
      {children}
    </button>
  );
}
