"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRoom } from "@/realtime/room-provider";
import { gestureLock, inkColor, screenToWorld, useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import { strokeHit } from "@/lib/ink";
import type { InkDraft } from "@/lib/types";

const INK_BROADCAST_MS = 45;
/** Smallest eraser reach in screen pixels, before the brush size raises it. */
const MIN_ERASER_RADIUS = 7;

/**
 * A screen-space capture surface active only while the draw or erase tool is
 * selected. It sits above items so a scribble lands on top of everything, and
 * hands pointer control back to the canvas the moment you switch to select.
 */
export default function InkOverlay() {
  const { createStroke, eraseStroke, broadcastInk, canEdit } = useRoom();
  const tool = useRoomStore((s) => s.tool);

  const ref = useRef<HTMLDivElement>(null);
  const draft = useRef<InkDraft | null>(null);
  const lastSent = useRef(0);
  const erasing = useRef(false);
  /** Only this pointer feeds the stroke; a second finger is not part of it. */
  const activePointer = useRef<number | null>(null);
  /**
   * Once a stylus has touched the surface we stop accepting plain touches, so
   * the hand resting on a tablet does not draw alongside the pen.
   */
  const penSeen = useRef(false);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    const vp = useRoomStore.getState().viewport;
    const x = clientX - (rect?.left ?? 0);
    const y = clientY - (rect?.top ?? 0);
    return screenToWorld(vp, x, y);
  }, []);

  const eraseAt = useCallback(
    (clientX: number, clientY: number) => {
      const world = toWorld(clientX, clientY);
      const { viewport, brush } = useRoomStore.getState();
      // The eraser takes its reach from the brush size, so the one slider sets
      // both and the preview dot shows what you are about to rub out.
      const radius = Math.max(MIN_ERASER_RADIUS, brush.size) / viewport.scale;
      const strokes = useRoomStore.getState().strokes;
      for (const stroke of Object.values(strokes)) {
        if (strokeHit(stroke, world.x, world.y, radius)) void eraseStroke(stroke.id);
      }
    },
    [eraseStroke, toWorld],
  );

  /** Drops an in-flight stroke without committing it. */
  const abort = useCallback(() => {
    activePointer.current = null;
    erasing.current = false;
    if (draft.current) {
      draft.current = null;
      broadcastInk(null);
    }
  }, [broadcastInk]);

  /** Commits whatever has been drawn so far. */
  const finishAt = useCallback(() => {
    activePointer.current = null;

    if (erasing.current) {
      erasing.current = false;
      return;
    }

    const current = draft.current;
    draft.current = null;
    if (!current) return;

    if (current.points.length >= 2) {
      void createStroke(current.color, current.size, current.points);
    } else {
      broadcastInk(null);
    }
  }, [broadcastInk, createStroke]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!canEdit || event.button !== 0) return;
      if (event.pointerType === "pen") penSeen.current = true;
      // Palm rejection, and never two strokes at once.
      if (penSeen.current && event.pointerType === "touch") return;
      if (activePointer.current !== null) return;
      if (gestureLock.pinching) return;

      activePointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);

      if (tool === "erase") {
        erasing.current = true;
        eraseAt(event.clientX, event.clientY);
        return;
      }

      const brush = useRoomStore.getState().brush;
      const world = toWorld(event.clientX, event.clientY);
      const me = useRoomStore.getState().me;
      draft.current = {
        id: newId(),
        userId: me?.userId ?? "me",
        color: inkColor(brush.color, brush.opacity ?? 1),
        // Store width in world units so it reads the same on screen whatever
        // the zoom was when it was drawn.
        size: brush.size / useRoomStore.getState().viewport.scale,
        points: [world.x, world.y],
      };
      broadcastInk(draft.current);
    },
    [broadcastInk, canEdit, eraseAt, toWorld, tool],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      // Two fingers means the room is being pinched, not drawn on.
      if (gestureLock.pinching) {
        abort();
        return;
      }
      // A missed release (pointer left the window) must not keep painting.
      if (event.buttons === 0) {
        finishAt();
        return;
      }
      if (erasing.current) {
        eraseAt(event.clientX, event.clientY);
        return;
      }
      const current = draft.current;
      if (!current) return;

      const world = toWorld(event.clientX, event.clientY);
      current.points.push(world.x, world.y);

      const now = Date.now();
      if (now - lastSent.current >= INK_BROADCAST_MS) {
        lastSent.current = now;
        broadcastInk({ ...current, points: current.points.slice() });
      }
    },
    [abort, broadcastInk, eraseAt, finishAt, toWorld],
  );

  const finish = useCallback(
    (event: React.PointerEvent) => {
      if (activePointer.current !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishAt();
    },
    [finishAt],
  );

  // If the tool changes mid-stroke, drop whatever was in flight.
  useEffect(() => {
    return () => {
      if (draft.current) {
        broadcastInk(null);
        draft.current = null;
      }
      erasing.current = false;
    };
  }, [broadcastInk]);

  return (
    <div
      ref={ref}
      // Above the canvas items (so a scribble lands on top of them) but below
      // the dock and top bar (z-50), so the tool buttons stay clickable -- the
      // whole point being you can switch back to the cursor without a reload.
      className="absolute inset-0 z-30"
      style={{ cursor: tool === "erase" ? "cell" : "crosshair", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={() => finishAt()}
    />
  );
}
