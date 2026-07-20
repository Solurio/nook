"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Brush, Eraser, Trash2, Undo2 } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import type { DoodleState, DoodleStroke, Item } from "@/lib/types";

const INK = ["#f4efe6", "#f2a4b8", "#f6c177", "#a6d189", "#8bc7e8", "#c4a7f0"] as const;
const SIZES = [2, 4, 8] as const;
const BROADCAST_INTERVAL_MS = 55;
/** Eraser reach in normalized board units. */
const ERASE_RADIUS = 0.045;

type Mode = "draw" | "erase";

export default function Doodle({ item, state }: { item: Item<"game">; state: DoodleState }) {
  const { updateData, canEdit, broadcastStroke, liveStrokes } = useRoom();
  const me = useRoomStore((s) => s.me);

  const [mode, setMode] = useState<Mode>("draw");
  const [color, setColor] = useState<string>(me?.tint ?? INK[0]);
  const [size, setSize] = useState<number>(4);
  const [drawing, setDrawing] = useState<DoodleStroke | null>(null);

  const surface = useRef<SVGSVGElement>(null);
  const lastSent = useRef(0);
  const erasing = useRef(false);

  const toLocal = useCallback((event: React.PointerEvent): [number, number] | null => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ];
  }, []);

  /** Latest committed strokes, read fresh so concurrent edits are not lost. */
  const liveStrokesFor = useCallback((): DoodleStroke[] => {
    const live = useRoomStore.getState().items[item.id];
    if (live && live.kind === "game" && (live.data as { game: string }).game === "doodle") {
      return (live.data as { state: DoodleState }).state.strokes ?? [];
    }
    return state.strokes;
  }, [item.id, state.strokes]);

  const eraseAt = useCallback(
    (point: [number, number]) => {
      const current = liveStrokesFor();
      const kept = current.filter((stroke) => !hitsNormalized(stroke.points, point, ERASE_RADIUS));
      if (kept.length !== current.length) {
        void updateData(item.id, { game: "doodle", state: { strokes: kept } });
      }
    },
    [item.id, liveStrokesFor, updateData],
  );

  const start = useCallback(
    (event: React.PointerEvent) => {
      if (!canEdit || event.button !== 0) return;
      const point = toLocal(event);
      if (!point) return;

      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      if (mode === "erase") {
        erasing.current = true;
        eraseAt(point);
        return;
      }

      setDrawing({ id: newId(), color, size, points: [point[0], point[1]] });
    },
    [canEdit, color, eraseAt, mode, size, toLocal],
  );

  const extend = useCallback(
    (event: React.PointerEvent) => {
      const point = toLocal(event);
      if (!point) return;

      if (erasing.current) {
        event.stopPropagation();
        eraseAt(point);
        return;
      }

      if (!drawing) return;
      event.stopPropagation();

      const next: DoodleStroke = { ...drawing, points: [...drawing.points, point[0], point[1]] };
      setDrawing(next);

      const now = Date.now();
      if (now - lastSent.current >= BROADCAST_INTERVAL_MS) {
        lastSent.current = now;
        broadcastStroke(item.id, next);
      }
    },
    [broadcastStroke, drawing, eraseAt, item.id, toLocal],
  );

  const finish = useCallback(
    (event: React.PointerEvent) => {
      if (erasing.current) {
        erasing.current = false;
        event.stopPropagation();
        return;
      }
      if (!drawing) return;
      event.stopPropagation();
      setDrawing(null);

      // A tap with no travel is not a stroke worth keeping.
      if (drawing.points.length < 4) return;

      broadcastStroke(item.id, drawing);
      void updateData(item.id, {
        game: "doodle",
        state: { strokes: [...liveStrokesFor(), drawing].slice(-400) },
      });
    },
    [broadcastStroke, drawing, item.id, liveStrokesFor, updateData],
  );

  const undoMine = useCallback(() => {
    if (!canEdit || state.strokes.length === 0) return;
    void updateData(item.id, { game: "doodle", state: { strokes: state.strokes.slice(0, -1) } });
  }, [canEdit, item.id, state.strokes, updateData]);

  const clear = useCallback(() => {
    if (!canEdit) return;
    void updateData(item.id, { game: "doodle", state: { strokes: [] } });
  }, [canEdit, item.id, updateData]);

  // Committed strokes, plus whatever anyone (including you) is drawing now.
  const paths = useMemo(() => {
    const inFlight = liveStrokes[item.id] ?? [];
    const all = [...state.strokes, ...inFlight];
    if (drawing) all.push(drawing);
    return all;
  }, [drawing, item.id, liveStrokes, state.strokes]);

  return (
    <div className="surface grain flex size-full flex-col overflow-hidden rounded-2xl p-2.5">
      <svg
        ref={surface}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className={clsx(
          "min-h-0 w-full flex-1 rounded-xl bg-ink-950/55 inset-ring inset-ring-white/6",
          !canEdit ? "cursor-default" : mode === "erase" ? "cursor-cell" : "cursor-crosshair",
        )}
        onPointerDown={start}
        onPointerMove={extend}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {paths.map((stroke) => (
          <path
            key={stroke.id}
            d={toPath(stroke.points)}
            fill="none"
            stroke={stroke.color}
            // The unit viewBox is stretched non-uniformly, so the stroke opts
            // out of that transform and stays round at any item aspect ratio.
            vectorEffect="non-scaling-stroke"
            strokeWidth={stroke.size}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setMode("draw")}
          disabled={!canEdit}
          aria-label="pen"
          title="pen"
          className={clsx(
            "grid size-6 place-items-center rounded-lg transition disabled:opacity-35",
            mode === "draw" ? "bg-glow/25 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          <Brush className="size-3.5" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={() => setMode("erase")}
          disabled={!canEdit}
          aria-label="eraser"
          title="eraser"
          className={clsx(
            "grid size-6 place-items-center rounded-lg transition disabled:opacity-35",
            mode === "erase" ? "bg-glow/25 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          <Eraser className="size-3.5" strokeWidth={2.2} />
        </button>

        <div className="mx-0.5 h-4 w-px bg-white/12" />

        <div className="flex items-center gap-1">
          {INK.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => {
                setColor(swatch);
                setMode("draw");
              }}
              aria-label={`ink ${swatch}`}
              className={clsx(
                "size-4 rounded-full transition",
                color === swatch && mode === "draw"
                  ? "ring-2 ring-chalk ring-offset-2 ring-offset-ink-800"
                  : "hover:scale-110",
              )}
              style={{ background: swatch }}
            />
          ))}
        </div>

        <div className="mx-0.5 h-4 w-px bg-white/12" />

        <div className="flex items-center gap-1">
          {SIZES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSize(option)}
              aria-label={`brush ${option}`}
              className={clsx(
                "grid size-5 place-items-center rounded-lg transition",
                size === option ? "bg-white/14" : "hover:bg-white/8",
              )}
            >
              <span
                className="rounded-full bg-chalk"
                style={{ width: option + 2, height: option + 2 }}
              />
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={undoMine}
          disabled={!canEdit || state.strokes.length === 0}
          aria-label="undo last stroke"
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-35"
        >
          <Undo2 className="size-3.5" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!canEdit || state.strokes.length === 0}
          aria-label="clear the board"
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-red-300 disabled:opacity-35"
        >
          <Trash2 className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function toPath(points: number[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) {
    d += ` L ${points[i]} ${points[i + 1]}`;
  }
  return d;
}

/** Point-to-polyline test in normalized 0..1 board space, for the eraser. */
function hitsNormalized(points: number[], [px, py]: [number, number], radius: number): boolean {
  if (points.length < 2) return false;
  if (points.length === 2) return Math.hypot(px - points[0], py - points[1]) <= radius;

  for (let i = 0; i + 3 < points.length; i += 2) {
    if (segmentDistance(px, py, points[i], points[i + 1], points[i + 2], points[i + 3]) <= radius) {
      return true;
    }
  }
  return false;
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
