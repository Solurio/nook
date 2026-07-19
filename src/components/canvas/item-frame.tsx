"use client";

import { memo, useCallback, useRef } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { clampSize } from "@/lib/items";
import type { AnyItem, TransformPatch } from "@/lib/types";
import ItemRenderer from "@/components/items/item-renderer";

type Handle = "nw" | "ne" | "se" | "sw" | "rotate";

interface Gesture {
  pointerId: number;
  mode: "move" | "resize" | "rotate";
  handle: Handle | null;
  startX: number;
  startY: number;
  origin: TransformPatch;
  centerX: number;
  centerY: number;
  startAngle: number;
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
      event.stopPropagation();

      const origin = current();
      const scale = useRoomStore.getState().viewport.scale;
      const centerX = origin.x + origin.width / 2;
      const centerY = origin.y + origin.height / 2;

      gesture.current = {
        pointerId: event.pointerId,
        mode,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        centerX,
        centerY,
        startAngle: Math.atan2(event.clientY / scale - centerY, event.clientX / scale - centerX),
      };

      grab(item.id);
      select(item.id);
      void bringToFront(item.id);
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    },
    [bringToFront, canEdit, current, editing, grab, item.id, select],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      event.stopPropagation();

      const scale = useRoomStore.getState().viewport.scale;
      const dx = (event.clientX - g.startX) / scale;
      const dy = (event.clientY - g.startY) / scale;

      let patch: TransformPatch;

      if (g.mode === "move") {
        patch = { ...g.origin, x: Math.round(g.origin.x + dx), y: Math.round(g.origin.y + dy) };
      } else if (g.mode === "rotate") {
        const angle = Math.atan2(
          event.clientY / scale - g.centerY,
          event.clientX / scale - g.centerX,
        );
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
    [broadcastTransform, item.kind],
  );

  const endGesture = useCallback(
    (event: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointerId !== event.pointerId) return;
      gesture.current = null;
      event.stopPropagation();

      const patch = current();
      release(item.id);

      const moved =
        patch.x !== g.origin.x ||
        patch.y !== g.origin.y ||
        patch.width !== g.origin.width ||
        patch.height !== g.origin.height ||
        patch.rotation !== g.origin.rotation;

      if (moved) void commitTransform(patch);
    },
    [commitTransform, current, item.id, release],
  );

  const interactive = item.kind === "media" || item.kind === "embed" || item.kind === "game";

  return (
    <div
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
        if (event.button !== 0) return;
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
      onDoubleClick={(event) => {
        if (!canEdit) return;
        if (item.kind === "note" || item.kind === "text") {
          event.stopPropagation();
          setEditing(item.id);
        }
      }}
    >
      <div className="relative size-full">
        <ItemRenderer item={item} editing={editing} selected={selected} />
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
              onPointerMove={onPointerMove}
              onPointerUp={endGesture}
              className="absolute -top-8 left-1/2 flex h-6 w-16 -translate-x-1/2 cursor-grab items-center justify-center gap-0.5 rounded-full bg-glow/85 active:cursor-grabbing"
              title="Drag to move"
            >
              <span className="h-2.5 w-0.5 rounded-full bg-ink-950/55" />
              <span className="h-3.5 w-0.5 rounded-full bg-ink-950/55" />
              <span className="h-2.5 w-0.5 rounded-full bg-ink-950/55" />
            </div>
          )}

          <div
            onPointerDown={(event) => beginGesture(event, "rotate", "rotate")}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            className="absolute -right-9 -bottom-9 size-6 cursor-alias rounded-full bg-warm ring-2 ring-ink-950/45"
            title="Drag to rotate"
          />

          {(["nw", "ne", "se", "sw"] as const).map((handle) => (
            <div
              key={handle}
              onPointerDown={(event) => beginGesture(event, "resize", handle)}
              onPointerMove={onPointerMove}
              onPointerUp={endGesture}
              className={clsx(
                "absolute size-3.5 rounded-full bg-chalk ring-2 ring-glow/80",
                handle === "nw" && "-top-2 -left-2 cursor-nwse-resize",
                handle === "ne" && "-top-2 -right-2 cursor-nesw-resize",
                handle === "se" && "-right-2 -bottom-2 cursor-nwse-resize",
                handle === "sw" && "-bottom-2 -left-2 cursor-nesw-resize",
              )}
            />
          ))}
        </>
      )}
    </div>
  );
}

function resize(
  g: Gesture,
  dx: number,
  dy: number,
  kind: AnyItem["kind"],
  keepRatio: boolean,
): TransformPatch {
  const { origin, handle } = g;
  let { x, y, width, height } = origin;

  const west = handle === "nw" || handle === "sw";
  const north = handle === "nw" || handle === "ne";

  width = origin.width + (west ? -dx : dx);
  height = origin.height + (north ? -dy : dy);

  if (keepRatio) {
    const ratio = origin.width / origin.height;
    // Follow whichever axis the pointer committed to hardest.
    if (Math.abs(dx) > Math.abs(dy)) height = width / ratio;
    else width = height * ratio;
  }

  const clamped = clampSize(kind, width, height);

  if (west) x = origin.x + (origin.width - clamped.width);
  if (north) y = origin.y + (origin.height - clamped.height);

  return {
    id: origin.id,
    x: Math.round(x),
    y: Math.round(y),
    width: clamped.width,
    height: clamped.height,
    rotation: origin.rotation,
  };
}

export default memo(ItemFrame);
