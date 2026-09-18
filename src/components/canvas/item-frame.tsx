"use client";

import { memo, useCallback, useRef } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { gestureLock, useRoomStore } from "@/state/room-store";
import { clampSize } from "@/lib/items";
import { linkGroups, snap } from "@/lib/grid";
import { newId } from "@/lib/slug";
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
  /** Where everything tied to this item started, so a drag moves the bundle. */
  followers: TransformPatch[];
  /** How far the pointer has taken things so far, in room pixels. */
  dx: number;
  dy: number;
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
  const { canEdit, broadcastTransform, commitTransform, updateData, setNotice } = useRoom();
  const select = useRoomStore((s) => s.select);
  const setEditing = useRoomStore((s) => s.setEditing);
  const grab = useRoomStore((s) => s.grab);
  const release = useRoomStore((s) => s.release);

  const gesture = useRef<Gesture | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const pinned = Boolean(item.data?.pinned);
  const group = item.data?.group;
  // Whatever is tied to the selected thing is outlined along with it.
  const mate = useRoomStore((s) =>
    Boolean(group && s.selectedId && s.selectedId !== item.id && s.items[s.selectedId]?.data?.group === group),
  );

  /**
   * Handles live inside the canvas layer, so they shrink with everything else
   * -- and a room fitted onto a phone sits at about a third size, which turned
   * a 36px grab target into 12px of nothing. Counter-scaling keeps them the
   * size they were drawn at, whatever the zoom.
   */
  const scale = useRoomStore((s) => s.viewport.scale);
  const inv = Math.min(4, Math.max(0.5, 1 / scale));
  const counter = { transform: `scale(${inv})` };

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
      if (!canEdit || editing || pinned) return;
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
        followers:
          mode === "move" && group
            ? Object.values(useRoomStore.getState().items)
                .filter((other) => other.id !== item.id && other.data?.group === group && !other.data?.pinned)
                .map((other) => ({ id: other.id, x: other.x, y: other.y, width: other.width, height: other.height, rotation: other.rotation }))
            : [],
        dx: 0,
        dy: 0,
      };
      // Held like the item itself, so a save landing from elsewhere mid-drag
      // cannot put one of them back where it was.
      for (const follower of gesture.current.followers) grab(follower.id);

      grab(item.id);
      select(item.id);
      // Note what this deliberately does not do: raise the item. Touching
      // anything used to send it to the top, which quietly undid whatever
      // arrangement you had made -- reach for something small tucked behind a
      // photo and it leapt in front of it. Stacking is deliberate now, from
      // the inspector.
      // Capture on the frame itself. Capturing on the handle meant a re-render
      // that swapped the handle out dropped the capture, the pointerup never
      // landed, and the item kept trailing the cursor with no button held.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [canEdit, current, editing, grab, group, item.id, pinned, select],
  );

  /** Moves things to where they are now, for this screen and everyone else's. */
  const place = useCallback(
    (patches: TransformPatch[]) => {
      useRoomStore.setState((state) => {
        const items = { ...state.items };
        for (const patch of patches) {
          const live = items[patch.id];
          if (live) items[patch.id] = { ...live, ...patch };
        }
        return { items };
      });
      broadcastTransform(patches);
    },
    [broadcastTransform],
  );

  const finish = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;

    let patch = current();
    release(item.id);
    for (const follower of g.followers) release(follower.id);

    const moved =
      patch.x !== g.origin.x ||
      patch.y !== g.origin.y ||
      patch.width !== g.origin.width ||
      patch.height !== g.origin.height ||
      patch.rotation !== g.origin.rotation;
    if (!moved) return;

    // A piece let go over a grid settles into the cell it landed in. Grids
    // tied to the piece move with it, so those do not count.
    let shift = { x: 0, y: 0 };
    if (g.mode === "move" && item.kind === "token") {
      const cx = patch.x + patch.width / 2;
      const cy = patch.y + patch.height / 2;
      const board = Object.values(useRoomStore.getState().items)
        .filter(
          (other) =>
            other.kind === "grid" &&
            other.rotation === 0 &&
            (!group || other.data?.group !== group) &&
            cx >= other.x &&
            cx <= other.x + other.width &&
            cy >= other.y &&
            cy <= other.y + other.height,
        )
        .sort((a, b) => b.z - a.z)[0];
      if (board && board.kind === "grid") {
        const grid = board.data as { shape?: "square" | "hex"; cell?: number };
        const at = snap(grid.shape ?? "square", cx - board.x, cy - board.y, Math.max(8, grid.cell ?? 48));
        shift = {
          x: Math.round(board.x + at.x - patch.width / 2) - patch.x,
          y: Math.round(board.y + at.y - patch.height / 2) - patch.y,
        };
      }
    }

    // Worked out from the drag itself rather than read back, so they land
    // exactly as far as the item did.
    const followers = g.followers.map((f) => ({
      ...f,
      x: Math.round(f.x + g.dx) + shift.x,
      y: Math.round(f.y + g.dy) + shift.y,
    }));
    patch = { ...patch, x: patch.x + shift.x, y: patch.y + shift.y };
    place([patch, ...followers]);
    void commitTransform(patch);
    for (const follower of followers) void commitTransform(follower);
  }, [commitTransform, current, group, item.id, item.kind, place, release]);

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
      g.dx = dx;
      g.dy = dy;

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

      const followers =
        g.mode === "move"
          ? g.followers.map((f) => ({ ...f, x: Math.round(f.x + dx), y: Math.round(f.y + dy) }))
          : [];
      place([patch, ...followers]);
    },
    [finish, item.kind, place],
  );

  /** Ties this item to the one waiting to be linked. */
  const linkTo = useCallback(
    (source: string) => {
      const items = useRoomStore.getState().items;
      const groups = Object.fromEntries(Object.values(items).map((other) => [other.id, other.data?.group]));
      const joined = linkGroups(groups, source, item.id, newId());
      for (const [id, next] of Object.entries(joined)) {
        const live = items[id];
        if (live && live.data?.group !== next) void updateData(live.id, { ...live.data, group: next } as never);
      }
      useRoomStore.getState().setLinking(null);
      setNotice("linked: they move together now");
    },
    [item.id, setNotice, updateData],
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
    item.kind === "screencast" ||
    item.kind === "pdf";

  const handleProps = {
    onPointerMove,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onLostPointerCapture: finish,
  };

  return (
    <div
      ref={frameRef}
      className="absolute"
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
        // Waiting to link something: this tap is the other end.
        const linking = useRoomStore.getState().linking;
        if (linking && canEdit) {
          event.stopPropagation();
          if (linking === item.id) useRoomStore.getState().setLinking(null);
          else linkTo(linking);
          select(item.id);
          return;
        }
        // A pinned item still answers to a tap -- there has to be a way back
        // to the button that unpins it -- it just refuses to budge. So does
        // everything in a locked room: you cannot change it, but you can still
        // pick it up to read it, which on a phone means opening it.
        if (pinned || !canEdit) {
          select(item.id);
          return;
        }
        // Media, embeds and games own their own clicks; dragging those uses
        // the grip in the selection frame instead.
        if (interactive && !event.altKey) {
          select(item.id);
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

      {mate && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl border-dashed border-glow/60"
          style={{ inset: -5 * inv, borderWidth: 2 * inv }}
        />
      )}

      {selected && canEdit && pinned && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-1.5 rounded-xl border-2 border-dashed border-warm/65"
        />
      )}

      {selected && canEdit && !editing && !pinned && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-xl outline-glow/70"
            style={{
              inset: -6 * inv,
              outlineStyle: "solid",
              outlineWidth: 2 * inv,
            }}
          />

          {interactive && (
            <div
              onPointerDown={(event) => beginGesture(event, "move", null)}
              {...handleProps}
              style={{ height: 28 * inv, top: -36 * inv }}
              className="absolute left-0 flex w-full cursor-grab touch-none items-center justify-center gap-1 rounded-lg bg-glow/85 active:cursor-grabbing"
              title="Drag to move"
            >
              <span
                className="font-semibold text-ink-950/70"
                style={{ fontSize: 10 * inv }}
              >
                drag to move
              </span>
            </div>
          )}

          {/* A generous invisible pad around each handle makes them easy to grab
              with a finger without visually bulking up the frame. */}
          <div
            onPointerDown={(event) => beginGesture(event, "rotate", "rotate")}
            {...handleProps}
            style={{ right: -48 * inv, bottom: -48 * inv, ...counter }}
            className="absolute grid size-11 cursor-alias touch-none place-items-center"
            title="Drag to rotate"
          >
            <span className="size-5 rounded-full bg-warm ring-2 ring-ink-950/45" />
          </div>

          {(["nw", "ne", "se", "sw"] as const).map((handle) => (
            <div
              key={handle}
              onPointerDown={(event) => beginGesture(event, "resize", handle)}
              {...handleProps}
              style={counter}
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
