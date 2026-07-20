"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRoom } from "@/realtime/room-provider";
import { screenToWorld, useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import { strokeHit } from "@/lib/ink";
import type { InkDraft } from "@/lib/types";

const INK_BROADCAST_MS = 45;
/** Eraser reach in screen pixels; converted to world units per zoom level. */
const ERASER_SCREEN_RADIUS = 14;

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
      const scale = useRoomStore.getState().viewport.scale;
      const radius = ERASER_SCREEN_RADIUS / scale;
      const strokes = useRoomStore.getState().strokes;
      for (const stroke of Object.values(strokes)) {
        if (strokeHit(stroke, world.x, world.y, radius)) void eraseStroke(stroke.id);
      }
    },
    [eraseStroke, toWorld],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!canEdit || event.button !== 0) return;
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
        color: brush.color,
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
    [broadcastInk, eraseAt, toWorld],
  );

  const finish = useCallback(
    (event: React.PointerEvent) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

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
    },
    [broadcastInk, createStroke],
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
      className="absolute inset-0 z-[6000]"
      style={{ cursor: tool === "erase" ? "cell" : "crosshair", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    />
  );
}
