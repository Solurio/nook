"use client";

import { memo, useCallback, useRef } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { gestureLock, useRoomStore } from "@/state/room-store";
import { clampSize } from "@/lib/items";
import type { AnyItem, TransformPatch } from "@/lib/types";
import ItemRenderer from "@/components/items/item-renderer";
import ItemErrorBoundary from "./item-error-boundary";

type Handle = "nw" | "ne" | "se" | "sw" | "rotate";

interface Gesture {
  pointerId: number;
  mode: "move" | "resize" | "rotate";
  handle: Handle | null;
  startX: number;
  startY: number;
  origin: TransformPatch;
  /** Item centre in screen pixels. Rotation is measured against this so the
   *  angle never depends on pan or zoom. */
  pivotX: number;
  pivotY: number;
  startAngle: number;
}

/** Rotate a vector by `deg`. */
function spin(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function ItemFrame({
  item,
  selected,
  editing,
}: {
  item: AnyItem;
  selected: boolean;
  editing: boolean;
}) {
  const { canEdit, broadcastTransform, commitTransform, bringToFront } = useRoom();
  const select = useRoomStore((s) => s.select);
  const setEditing = useRoomStore((s) => s.setEditing);
  const grab = useRoomStore((s) => s.grab);
  const release = useRoomStore((s) => s.release);

  const gesture = useRef<Gesture | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const current = useCallback((): TransformPatch => {
    const live = useRoomStore.getState().items[item.id] ?? item;
    return {
      id: live.id,
      x: live.x,
      y: live.y,
      width: live.width,
      height: live.height,
      rotation: live.rotation,
    };
  }, [item]);

  const beginGesture = useCallback(
    (event: React.PointerEvent, mode: Gesture["mode"], handle: Handle | null) => {
      if (!canEdit || editing) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      event.stopPropagation();

      const origin = current();

      // The frame is rotated about its own centre, so the bounding box centre is
      // the item centre on screen no matter how it is turned.
      const rect = frameRef.current?.getBoundingClientRect();
      const pivotX = rect ? rect.left + rect.width / 2 : event.clientX;
      const pivotY = rect ? rect.top + rect.height / 2 : event.clientY;

      gesture.current = {
        pointerId: event.pointerId,
        mode,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        pivotX,
        pivotY,
        startAngle: Math.atan2(event.clientY - pivotY, event.clientX - pivotX),
      };

      grab(item.id);
      select(item.id);
      void bringToFront(item.id);
      // Capture on the frame itself. Capturing on the handle meant a re-render
      // that swapped the handle out dropped the capture, the pointerup never
      // landed, and the item kept trailing the cursor with no button held.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [bringToFront, canEdit, current, editing, grab, item.id, select],
  );

  const finish = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;

    const patch = current();
    release(item.id);

    const moved =
      patch.x !== g.origin.x ||
      patch.y !== g.origin.y ||
      patch.width !== g.origin.width ||
      patch.height !== g.origin.height ||
      patch.rotation !== g.origin.rotation;

    if (moved) void commitTransform(patch);
  }, [commitTransform, current, item.id, release]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;

      // No button left down means we missed the release (pointer left the
      // window, another element ate it). Settle up instead of dragging on.
      if (event.buttons === 0) {
        finish();
        return;
      }
      // A second finger means the room is being pinched, not this item dragged.
      if (gestureLock.pinching) {
        finish();
        return;
      }
      event.stopPropagation();

      const scale = useRoomStore.getState().viewport.scale;
      const dx = (event.clientX - g.startX) / scale;
      const dy = (event.clientY - g.startY) / scale;

      let patch: TransformPatch;

      if (g.mode === "move") {
        patch = { ...g.origin, x: Math.round(g.origin.x + dx), y: Math.round(g.origin.y + dy) };
      } else if (g.mode === "rotate") {
        const angle = Math.atan2(event.clientY - g.pivotY, event.clientX - g.pivotX);
        const degrees = g.origin.rotation + ((angle - g.startAngle) * 180) / Math.PI;
        // Snapping near the cardinals makes straightening a photo painless.
        const snapped = Math.abs(degrees % 90) < 3 ? Math.round(degrees / 90) * 90 : degrees;
        patch = { ...g.origin, rotation: Math.round(snapped * 10) / 10 };
      } else {
        patch = resize(g, dx, dy, item.kind, event.shiftKey);
      }

      useRoomStore.setState((state) => {
        const live = state.items[patch.id];
        if (!live) return {};
        return { items: { ...state.items, [patch.id]: { ...live, ...patch } } };
      });

      broadcastTransform(patch);
    },
    [broadcastTransform, finish, item.kind],
  );

  const endGesture = useCallback(
    (event: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      event.stopPropagation();
      finish();
    },
    [finish],
  );

  const interactive =
    item.kind === "media" ||
    item.kind === "embed" ||
    item.kind === "game" ||
    item.kind === "cobrowse" ||
    item.kind === "screencast";

  const handleProps = {
    onPointerMove,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onLostPointerCapture: finish,
  };

  return (
    <div
      ref={frameRef}
      className="absolute will-change-transform"
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        transform: `rotate(${item.rotation}deg)`,
        zIndex: item.z,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        // Media, embeds and games own their own clicks; dragging those uses
        // the grip in the selection frame instead.
        if (interactive && !event.altKey) {
          select(item.id);
          void bringToFront(item.id);
          return;
        }
        beginGesture(event, "move", null);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onLostPointerCapture={finish}
      onDoubleClick={(event) => {
        if (!canEdit) return;
        if (item.kind === "note" || item.kind === "text") {
          event.stopPropagation();
          setEditing(item.id);
        }
      }}
    >
      <div className="relative size-full">
        <ItemErrorBoundary resetKey={item.updated_at}>
          <ItemRenderer item={item} editing={editing} selected={selected} />
        </ItemErrorBoundary>
      </div>

      {selected && canEdit && !editing && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-1.5 rounded-xl ring-2 ring-glow/70"
          />

          {interactive && (
            <div
              onPointerDown={(event) => beginGesture(event, "move", null)}
              {...handleProps}
              className="absolute -top-9 left-0 flex h-7 w-full cursor-grab touch-none items-center justify-center gap-1 rounded-lg bg-glow/85 active:cursor-grabbing"
              title="Drag to move"
            >
              <span className="h-1 w-1 rounded-full bg-ink-950/55" />
              <span className="h-1 w-1 rounded-full bg-ink-950/55" />
              <span className="h-1 w-1 rounded-full bg-ink-950/55" />
              <span className="ml-1 text-[10px] font-semibold text-ink-950/70">move</span>
            </div>
          )}

          {/* A generous invisible pad around each handle makes them easy to grab
              with a finger without visually bulking up the frame. */}
          <div
            onPointerDown={(event) => beginGesture(event, "rotate", "rotate")}
            {...handleProps}
            className="absolute -right-12 -bottom-12 grid size-11 cursor-alias touch-none place-items-center"
            title="Drag to rotate"
          >
            <span className="size-5 rounded-full bg-warm ring-2 ring-ink-950/45" />
          </div>

          {(["nw", "ne", "se", "sw"] as const).map((handle) => (
            <div
              key={handle}
              onPointerDown={(event) => beginGesture(event, "resize", handle)}
              {...handleProps}
              className={clsx(
                "absolute grid size-9 touch-none place-items-center",
                handle === "nw" && "-top-4.5 -left-4.5 cursor-nwse-resize",
                handle === "ne" && "-top-4.5 -right-4.5 cursor-nesw-resize",
                handle === "se" && "-right-4.5 -bottom-4.5 cursor-nwse-resize",
                handle === "sw" && "-bottom-4.5 -left-4.5 cursor-nesw-resize",
              )}
            >
              <span className="size-3.5 rounded-full bg-chalk ring-2 ring-glow/80" />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Resize around the corner opposite the one being dragged. The pointer delta is
 * first turned into the item's own axes, so a rotated photo grows the way it
 * looks like it should instead of along the screen axes.
 */
function resize(
  g: Gesture,
  dx: number,
  dy: number,
  kind: AnyItem["kind"],
  keepRatio: boolean,
): TransformPatch {
  const { origin, handle } = g;
  const rotation = origin.rotation;

  const local = spin(dx, dy, -rotation);
  const west = handle === "nw" || handle === "sw";
  const north = handle === "nw" || handle === "ne";

  let width = origin.width + (west ? -local.x : local.x);
  let height = origin.height + (north ? -local.y : local.y);

  if (keepRatio) {
    const ratio = origin.width / origin.height;
    // Follow whichever axis the pointer committed to hardest.
    if (Math.abs(local.x) > Math.abs(local.y)) height = width / ratio;
    else width = height * ratio;
  }

  const clamped = clampSize(kind, width, height);

  // Pin the opposite corner: work out where it sits now, then place the new box
  // so that same corner lands back on it.
  const ax = west ? 1 : -1;
  const ay = north ? 1 : -1;

  const cx = origin.x + origin.width / 2;
  const cy = origin.y + origin.height / 2;
  const before = spin((ax * origin.width) / 2, (ay * origin.height) / 2, rotation);
  const anchorX = cx + before.x;
  const anchorY = cy + before.y;

  const after = spin((ax * clamped.width) / 2, (ay * clamped.height) / 2, rotation);
  const centerX = anchorX - after.x;
  const centerY = anchorY - after.y;

  return {
    id: origin.id,
    x: Math.round(centerX - clamped.width / 2),
    y: Math.round(centerY - clamped.height / 2),
    width: clamped.width,
    height: clamped.height,
    rotation,
  };
}

export default memo(ItemFrame);
