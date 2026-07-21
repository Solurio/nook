"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Download,
  Eraser,
  Eye,
  EyeOff,
  Highlighter,
  Layers,
  Pen,
  Plus,
  SprayCan,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import { defaultLayers, exportCanvas, layersOf, renderComposite, renderStroke } from "@/lib/paint";
import type { DoodleBrush, DoodleLayer, DoodleState, DoodleStroke, Item } from "@/lib/types";

const SWATCHES = [
  "#f4efe6", "#1a1420", "#f2a4b8", "#e0655c", "#f6c177", "#f4d35e",
  "#a6d189", "#4f9d69", "#8bc7e8", "#4f77c4", "#c4a7f0", "#9b5de5",
] as const;

const BROADCAST_MS = 45;

export default function Doodle({ item, state }: { item: Item<"game">; state: DoodleState }) {
  const { updateData, canEdit, broadcastStroke, liveStrokes } = useRoom();
  const me = useRoomStore((s) => s.me);

  const layers = layersOf(state.layers);

  const [brush, setBrush] = useState<DoodleBrush>("pen");
  const [color, setColor] = useState<string>(me?.tint ?? "#f4efe6");
  const [size, setSize] = useState(6);
  const [opacity, setOpacity] = useState(1);
  const [pressure, setPressure] = useState(0.6);
  const [activeLayerState, setActiveLayer] = useState(layers[layers.length - 1].id);
  const [showLayers, setShowLayers] = useState(false);

  // Derived so it stays valid if a layer is removed elsewhere -- no sync effect.
  const activeLayer = layers.some((l) => l.id === activeLayerState)
    ? activeLayerState
    : layers[layers.length - 1].id;

  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const committed = useRef<HTMLCanvasElement | null>(null);
  const dpr = useRef(1);
  const drawing = useRef<DoodleStroke | null>(null);
  const lastSent = useRef(0);

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const paint = useCallback(() => {
    const c = canvas.current;
    const com = committed.current;
    if (!c || !com) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(com, 0, 0);

    // In-flight strokes (mine + everyone else's) sit on top for the live preview.
    const live = liveStrokes[item.id] ?? [];
    for (const stroke of live) renderStroke(ctx, stroke, c.width, c.height, dpr.current);
    if (drawing.current) renderStroke(ctx, drawing.current, c.width, c.height, dpr.current);
  }, [item.id, liveStrokes]);

  const renderCommitted = useCallback(() => {
    const com = committed.current;
    if (!com) return;
    renderComposite(com, state.strokes, layers, dpr.current);
    paint();
  }, [state.strokes, layers, paint]);

  // A ref lets the mount-once resize observer call the freshest renderer.
  const renderRef = useRef(renderCommitted);
  useEffect(() => {
    renderRef.current = renderCommitted;
  });

  // Size the canvas to its box (crisp on retina) and repaint. Mounts once.
  useEffect(() => {
    const box = container.current;
    const c = canvas.current;
    if (!box || !c) return;
    if (!committed.current) committed.current = document.createElement("canvas");

    const resize = () => {
      const rect = box.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * ratio));
      const h = Math.max(1, Math.round(rect.height * ratio));
      if (c.width === w && c.height === h) return;
      c.width = w;
      c.height = h;
      committed.current!.width = w;
      committed.current!.height = h;
      dpr.current = ratio;
      renderRef.current();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => renderCommitted(), [renderCommitted]);

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  const toLocal = useCallback((event: React.PointerEvent): [number, number] | null => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ];
  }, []);

  const pressureOf = useCallback(
    (event: React.PointerEvent) => {
      // Mouse reports 0 or 0.5; only trust real pen pressure.
      const raw = event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 1;
      return 1 - pressure + pressure * raw;
    },
    [pressure],
  );

  const latestStrokes = useCallback((): DoodleStroke[] => {
    const live = useRoomStore.getState().items[item.id];
    if (live && live.kind === "game" && (live.data as { game: string }).game === "doodle") {
      return (live.data as { state: DoodleState }).state.strokes ?? [];
    }
    return state.strokes;
  }, [item.id, state.strokes]);

  const commitState = useCallback(
    (strokes: DoodleStroke[], nextLayers: DoodleLayer[] = layers) => {
      void updateData(item.id, { game: "doodle", state: { strokes, layers: nextLayers } });
    },
    [item.id, layers, updateData],
  );

  const start = useCallback(
    (event: React.PointerEvent) => {
      if (!canEdit || event.button !== 0) return;
      const point = toLocal(event);
      if (!point) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      drawing.current = {
        id: newId(),
        color,
        size,
        opacity,
        brush,
        layer: activeLayer,
        points: [point[0], point[1]],
        pressures: [pressureOf(event)],
      };
      paint();
    },
    [activeLayer, brush, canEdit, color, opacity, paint, pressureOf, size, toLocal],
  );

  const extend = useCallback(
    (event: React.PointerEvent) => {
      const d = drawing.current;
      if (!d) return;
      const point = toLocal(event);
      if (!point) return;
      event.stopPropagation();

      d.points.push(point[0], point[1]);
      d.pressures!.push(pressureOf(event));
      paint();

      const now = Date.now();
      if (now - lastSent.current >= BROADCAST_MS) {
        lastSent.current = now;
        broadcastStroke(item.id, { ...d, points: d.points.slice(), pressures: d.pressures!.slice() });
      }
    },
    [broadcastStroke, item.id, paint, pressureOf, toLocal],
  );

  const finish = useCallback(
    (event: React.PointerEvent) => {
      const d = drawing.current;
      if (!d) return;
      event.stopPropagation();
      drawing.current = null;

      if (d.points.length < 2) {
        paint();
        return;
      }
      broadcastStroke(item.id, d);
      commitState([...latestStrokes(), d].slice(-600));
      paint();
    },
    [broadcastStroke, commitState, item.id, latestStrokes, paint],
  );

  // ---------------------------------------------------------------------------
  // Toolbar actions
  // ---------------------------------------------------------------------------

  const undo = useCallback(() => {
    if (!canEdit) return;
    const strokes = latestStrokes();
    if (strokes.length === 0) return;
    commitState(strokes.slice(0, -1));
  }, [canEdit, commitState, latestStrokes]);

  const clear = useCallback(() => {
    if (!canEdit) return;
    commitState([]);
  }, [canEdit, commitState]);

  const download = useCallback(() => {
    const c = committed.current;
    if (!c) return;
    const out = exportCanvas(state.strokes, layers, c.width, c.height);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nook-doodle-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [layers, state.strokes]);

  // ----- Layers (plain handlers; they read the derived active layer) -----
  const addLayer = () => {
    if (!canEdit) return;
    const layer: DoodleLayer = {
      id: newId(),
      name: `layer ${layers.length + 1}`,
      visible: true,
      opacity: 1,
      hue: 0,
    };
    setActiveLayer(layer.id);
    commitState(latestStrokes(), [...layers, layer]);
  };

  const patchLayer = (id: string, patch: Partial<DoodleLayer>) => {
    commitState(
      latestStrokes(),
      layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const removeLayer = (id: string) => {
    if (layers.length <= 1) return;
    const nextLayers = layers.filter((l) => l.id !== id);
    if (activeLayer === id) setActiveLayer(nextLayers[nextLayers.length - 1].id);
    commitState(
      latestStrokes().filter((s) => (s.layer ?? "base") !== id),
      nextLayers.length ? nextLayers : defaultLayers(),
    );
  };

  return (
    <div className="surface grain flex size-full flex-col overflow-hidden rounded-2xl p-2">
      <div
        ref={container}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-[#faf7f0] inset-ring inset-ring-black/10"
      >
        <canvas
          ref={canvas}
          className={clsx("size-full touch-none", canEdit ? "cursor-crosshair" : "cursor-default")}
          onPointerDown={start}
          onPointerMove={extend}
          onPointerUp={finish}
          onPointerCancel={finish}
        />

        {showLayers && (
          <LayersPanel
            layers={layers}
            active={activeLayer}
            canEdit={canEdit}
            onSelect={setActiveLayer}
            onAdd={addLayer}
            onPatch={patchLayer}
            onRemove={removeLayer}
            onClose={() => setShowLayers(false)}
          />
        )}
      </div>

      {/* Tools */}
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-1">
          <Tool active={brush === "pen"} label="pen" onClick={() => setBrush("pen")} disabled={!canEdit}>
            <Pen className="size-3.5" strokeWidth={2.2} />
          </Tool>
          <Tool active={brush === "marker"} label="marker" onClick={() => setBrush("marker")} disabled={!canEdit}>
            <Highlighter className="size-3.5" strokeWidth={2.2} />
          </Tool>
          <Tool active={brush === "airbrush"} label="airbrush" onClick={() => setBrush("airbrush")} disabled={!canEdit}>
            <SprayCan className="size-3.5" strokeWidth={2.2} />
          </Tool>
          <Tool active={brush === "eraser"} label="eraser" onClick={() => setBrush("eraser")} disabled={!canEdit}>
            <Eraser className="size-3.5" strokeWidth={2.2} />
          </Tool>

          <div className="mx-0.5 h-4 w-px bg-white/12" />

          <label
            className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/25"
            style={{ background: color }}
            title="pick a colour"
          >
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar">
            {SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                onClick={() => setColor(sw)}
                aria-label={`colour ${sw}`}
                className={clsx(
                  "size-4 shrink-0 rounded-full transition",
                  color.toLowerCase() === sw.toLowerCase() && "ring-2 ring-chalk ring-offset-1 ring-offset-ink-800",
                )}
                style={{ background: sw }}
              />
            ))}
          </div>

          <div className="flex-1" />

          <Tool active={showLayers} label="layers" onClick={() => setShowLayers((v) => !v)} disabled={!canEdit}>
            <Layers className="size-3.5" strokeWidth={2.2} />
          </Tool>
          <Tool label="undo" onClick={undo} disabled={!canEdit || state.strokes.length === 0}>
            <Undo2 className="size-3.5" strokeWidth={2.2} />
          </Tool>
          <Tool label="download png" onClick={download} disabled={state.strokes.length === 0}>
            <Download className="size-3.5" strokeWidth={2.2} />
          </Tool>
          <Tool label="clear" danger onClick={clear} disabled={!canEdit || state.strokes.length === 0}>
            <Trash2 className="size-3.5" strokeWidth={2.2} />
          </Tool>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted">
          <Slider label="size" min={1} max={48} step={1} value={size} onChange={setSize} />
          <Slider label="flow" min={5} max={100} step={5} value={Math.round(opacity * 100)} onChange={(v) => setOpacity(v / 100)} />
          <Slider label="pen" min={0} max={100} step={10} value={Math.round(pressure * 100)} onChange={(v) => setPressure(v / 100)} />
        </div>
      </div>
    </div>
  );
}

function LayersPanel({
  layers,
  active,
  canEdit,
  onSelect,
  onAdd,
  onPatch,
  onRemove,
  onClose,
}: {
  layers: DoodleLayer[];
  active: string;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<DoodleLayer>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="surface-raised animate-drift-in absolute top-2 right-2 z-10 flex max-h-[85%] w-44 flex-col overflow-hidden rounded-xl shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/8 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold">layers</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onAdd} disabled={!canEdit} aria-label="add layer" className="grid size-5 place-items-center rounded text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-40">
            <Plus className="size-3.5" strokeWidth={2.4} />
          </button>
          <button type="button" onClick={onClose} aria-label="close" className="grid size-5 place-items-center rounded text-muted hover:bg-white/8 hover:text-chalk">
            <X className="size-3" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {[...layers].reverse().map((layer) => (
          <div
            key={layer.id}
            className={clsx(
              "mb-1 rounded-lg p-1.5 transition",
              active === layer.id ? "bg-glow/18 ring-1 ring-glow/40" : "hover:bg-white/5",
            )}
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPatch(layer.id, { visible: !layer.visible })}
                disabled={!canEdit}
                aria-label="toggle visibility"
                className="shrink-0 text-muted hover:text-chalk"
              >
                {layer.visible ? <Eye className="size-3.5" strokeWidth={2} /> : <EyeOff className="size-3.5" strokeWidth={2} />}
              </button>
              <button type="button" onClick={() => onSelect(layer.id)} className="min-w-0 flex-1 truncate text-left text-[11px]">
                {layer.name}
              </button>
              {layers.length > 1 && canEdit && (
                <button type="button" onClick={() => onRemove(layer.id)} aria-label="delete layer" className="shrink-0 text-muted hover:text-red-300">
                  <Trash2 className="size-3" strokeWidth={2} />
                </button>
              )}
            </div>
            {active === layer.id && canEdit && (
              <div className="mt-1 space-y-1">
                <Slider label="opac" min={10} max={100} step={10} value={Math.round(layer.opacity * 100)} onChange={(v) => onPatch(layer.id, { opacity: v / 100 })} />
                <Slider label="hue" min={0} max={340} step={20} value={layer.hue} onChange={(v) => onPatch(layer.id, { hue: v })} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tool({
  children,
  label,
  onClick,
  active,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "grid size-6 shrink-0 place-items-center rounded-lg transition disabled:opacity-35",
        active && "bg-glow/25 text-glow",
        !active && danger && "text-muted hover:bg-red-500/15 hover:text-red-300",
        !active && !danger && "text-muted hover:bg-white/8 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1">
      <span className="w-7 shrink-0 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={(event) => event.stopPropagation()}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-glow"
      />
    </label>
  );
}
