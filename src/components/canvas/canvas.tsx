"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoom } from "@/realtime/room-provider";
import {
  gestureLock,
  orderItems,
  screenToWorld,
  useRoomStore,
  type Viewport,
} from "@/state/room-store";
import { draftItem, topZ } from "@/lib/items";
import { uploadPdf } from "@/components/pdf/upload";
import { resolveLink } from "@/lib/embeds";
import { parseMediaLink } from "@/lib/media";
import { prepareImage } from "@/lib/image-upload";
import type { Background, MediaData, MediaProvider } from "@/lib/types";
import ItemFrame from "./item-frame";
import Cursors from "./cursors";
import PingLayer from "./ping-layer";
import DropVeil from "./drop-veil";
import RoomInkLayer from "./room-ink-layer";
import InkOverlay from "./ink-overlay";
import { t } from "@/lib/i18n";

const IMAGE_TYPES = /^image\//;
const PLAYABLE_TYPES = /^(audio|video)\//;
const PDF_TYPE = "application/pdf";

/** A fresh one-track queue, ready to play for the whole room. */
function newQueue(
  track: { provider: MediaProvider; ref: string; title: string },
  addedBy: string,
): MediaData {
  return {
    queue: [{ id: `${Date.now()}`, ...track, addedBy }],
    index: 0,
    playing: true,
    positionSec: 0,
    anchoredAt: Date.now(),
    volume: 60,
    audioOnly: track.provider === "audio",
  };
}


/** Kinds that the Delete and Backspace keys never remove: they are busy with keys of their own. */
const KEEPS_KEYS = new Set(["game", "media", "embed", "cobrowse", "screencast", "pdf"]);

export default function Canvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const room = useRoomStore((s) => s.room);
  // Subscribe to the stable items map; the ordered array is derived here so the
  // store hook never returns a fresh reference on an unrelated update.
  const itemMap = useRoomStore((s) => s.items);
  const items = useMemo(() => orderItems(itemMap), [itemMap]);
  const select = useRoomStore((s) => s.select);
  const setEditing = useRoomStore((s) => s.setEditing);
  const selectedId = useRoomStore((s) => s.selectedId);
  const picked = useRoomStore((s) => s.picked);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const editingId = useRoomStore((s) => s.editingId);
  const tool = useRoomStore((s) => s.tool);
  const reaction = useRoomStore((s) => s.reaction);
  const panBy = useRoomStore((s) => s.panBy);
  const zoomAt = useRoomStore((s) => s.zoomAt);
  const pinchTo = useRoomStore((s) => s.pinch);

  const { moveCursor, createItem, deleteItem, duplicateItem, uploadFile, canEdit, sendPing, setNotice } =
    useRoom();

  const [dropping, setDropping] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const panState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  // Shift-drag on the room, with a mouse: a box to pick everything it touches.
  const [box, setBox] = useState<{ pointerId: number; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  // ---------------------------------------------------------------------------
  // Pointer: pan the canvas, and tell everyone else where the cursor is.
  // ---------------------------------------------------------------------------

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const isBackground = event.target === event.currentTarget;
      if (isBackground && event.button === 0 && event.shiftKey && event.pointerType === "mouse" && !spaceHeld) {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        setBox({ pointerId: event.pointerId, x0: x, y0: y, x1: x, y1: y });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const wantsPan = event.button === 1 || spaceHeld || (event.button === 0 && isBackground);
      if (!wantsPan) return;

      if (isBackground && event.button === 0) {
        select(null);
        setEditing(null);
      }

      panState.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      setPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [select, setEditing, spaceHeld],
  );

  /**
   * A loaded reaction claims the press before anything else sees it. Capture
   * phase rather than bubble, because an item would otherwise swallow the
   * press and start dragging itself -- and a reaction is usually about the
   * thing you are pointing at, so landing one on a photo has to work.
   */
  const stamp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const glyph = useRoomStore.getState().reaction;
      if (!glyph) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;

      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const world = screenToWorld(
        useRoomStore.getState().viewport,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      sendPing(world.x, world.y, glyph);
      event.stopPropagation();
      event.preventDefault();
    },
    [sendPing],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (gestureLock.pinching) return;
      if (box && box.pointerId === event.pointerId) {
        const r = event.currentTarget.getBoundingClientRect();
        setBox({ ...box, x1: event.clientX - r.left, y1: event.clientY - r.top });
      }
      const pan = panState.current;
      if (pan && pan.pointerId === event.pointerId) {
        panBy(event.clientX - pan.lastX, event.clientY - pan.lastY);
        pan.lastX = event.clientX;
        pan.lastY = event.clientY;
      }

      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const world = screenToWorld(
        useRoomStore.getState().viewport,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      moveCursor(world.x, world.y);
    },
    [moveCursor, panBy, box],
  );

  const endPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (box && box.pointerId === event.pointerId) {
      const vp = useRoomStore.getState().viewport;
      const a = screenToWorld(vp, Math.min(box.x0, box.x1), Math.min(box.y0, box.y1));
      const b = screenToWorld(vp, Math.max(box.x0, box.x1), Math.max(box.y0, box.y1));
      const hits = Object.values(useRoomStore.getState().items)
        .filter((it) => it.x < b.x && it.x + it.width > a.x && it.y < b.y && it.y + it.height > a.y)
        .map((it) => it.id);
      useRoomStore.getState().setPicked(hits);
      setBox(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (panState.current?.pointerId !== event.pointerId) return;
    panState.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [box]);

  // Wheel needs a non-passive listener to keep the browser from zooming the page.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0022);
        zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
        return;
      }

      const scale = event.deltaMode === 1 ? 18 : 1;
      panBy(-event.deltaX * scale, -event.deltaY * scale);
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [panBy, zoomAt]);

  // Pinch to zoom, two fingers to pan. These listen in the capture phase so the
  // canvas sees both fingers even when one of them landed on a photo and that
  // item stopped propagation for its own drag.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const points = touches.current;

    const down = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      // A finger that lifts off the edge of the screen, or a gesture the
      // browser takes over, never sends its release -- and a leftover pointer
      // meant the count never came back to two and pinching was dead until the
      // page was reloaded. A fresh press with stale fingers starts over.
      if (points.size >= 2 && !points.has(event.pointerId)) points.clear();
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size !== 2) return;

      const [a, b] = [...points.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      gestureLock.pinching = true;
      // Hand off cleanly from whatever one finger was doing.
      panState.current = null;
      setPanning(false);
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const last = pinch.current;
      if (!last || points.size < 2) return;
      event.preventDefault();

      const [a, b] = [...points.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rect = node.getBoundingClientRect();

      // Zoom about the midpoint and follow it, in one write.
      const factor = last.dist > 0 && dist > 0 ? dist / last.dist : 1;
      pinchTo(factor, cx - rect.left, cy - rect.top, cx - last.cx, cy - last.cy);
      pinch.current = { dist, cx, cy };
    };

    const up = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      points.delete(event.pointerId);
      if (points.size >= 2) return;
      pinch.current = null;
      gestureLock.pinching = false;
    };

    // Releases are watched on the window as well: a finger lifted past the edge
    // of the canvas still has to count as gone.
    const forget = () => {
      points.clear();
      pinch.current = null;
      gestureLock.pinching = false;
    };

    const opts = { capture: true } as const;
    node.addEventListener("pointerdown", down, opts);
    node.addEventListener("pointermove", move, { capture: true, passive: false });
    node.addEventListener("pointerup", up, opts);
    node.addEventListener("pointercancel", up, opts);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    // Switching apps mid-pinch is the other way fingers go missing.
    window.addEventListener("blur", forget);
    document.addEventListener("visibilitychange", forget);
    return () => {
      node.removeEventListener("pointerdown", down, opts);
      node.removeEventListener("pointermove", move, { capture: true });
      node.removeEventListener("pointerup", up, opts);
      node.removeEventListener("pointercancel", up, opts);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", forget);
      document.removeEventListener("visibilitychange", forget);
      points.clear();
      pinch.current = null;
      gestureLock.pinching = false;
    };
  }, [pinchTo]);

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.isContentEditable ||
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT"
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !typing(event.target)) {
        setSpaceHeld(true);
        event.preventDefault();
        return;
      }

      if (typing(event.target)) return;

      const id = useRoomStore.getState().selectedId;
      const picked = useRoomStore.getState().picked;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        useRoomStore.getState().setPicked(Object.keys(useRoomStore.getState().items));
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && picked.length > 1 && canEdit) {
        event.preventDefault();
        const items = useRoomStore.getState().items;
        for (const pid of picked) if (items[pid] && !KEEPS_KEYS.has(items[pid].kind) && !items[pid].data?.pinned) void deleteItem(pid);
        return;
      }

      if (event.key === "Escape") {
        useRoomStore.getState().select(null);
        useRoomStore.getState().setEditing(null);
        useRoomStore.getState().setPanel(null);
        useRoomStore.getState().setTool("select");
        useRoomStore.getState().setReaction(null);
        return;
      }

      // Quick tool switches, the way most canvas apps do it.
      if (event.key.toLowerCase() === "v") useRoomStore.getState().setTool("select");
      if (event.key.toLowerCase() === "b" && canEdit) useRoomStore.getState().setTool("draw");
      if (event.key.toLowerCase() === "e" && canEdit) useRoomStore.getState().setTool("erase");

      if ((event.key === "Delete" || event.key === "Backspace") && id && canEdit) {
        // Games, players, documents and windows take keys of their own -- a word
        // being typed, a page being turned -- and a box that loses focus for a
        // moment would hand the next Backspace to the room. Those only go by the
        // bin. And anything with focus inside an item is left alone.
        const kind = useRoomStore.getState().items[id]?.kind;
        const busyItem = document.activeElement instanceof HTMLElement && document.activeElement.closest("[data-item-id]");
        if (!kind || KEEPS_KEYS.has(kind) || busyItem) return;
        event.preventDefault();
        void deleteItem(id);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && id && canEdit) {
        event.preventDefault();
        void duplicateItem(id);
        return;
      }

      if (event.key === "0" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        useRoomStore.getState().setViewport({ x: 0, y: 0, scale: 1 });
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [canEdit, deleteItem, duplicateItem]);

  // ---------------------------------------------------------------------------
  // Dropping and pasting things into the room
  // ---------------------------------------------------------------------------

  const placeAt = useCallback(
    (clientX: number, clientY: number) => {
      const rect = rootRef.current?.getBoundingClientRect();
      const vp = useRoomStore.getState().viewport;
      if (!rect) return { x: 0, y: 0 };
      return screenToWorld(vp, clientX - rect.left, clientY - rect.top);
    },
    [],
  );

  const acceptFiles = useCallback(
    async (files: File[], at: { x: number; y: number }) => {
      // Pictures go on the wall; songs and clips open in the synced player, so
      // dropping an mp3 or an mp4 gets you something everyone hears together.
      const usable = files.filter(
        (file) => IMAGE_TYPES.test(file.type) || PLAYABLE_TYPES.test(file.type) || file.type === PDF_TYPE,
      );
      let offset = 0;

      for (const original of usable) {
        // Phone photos arrive in formats browsers will not draw, and at sizes
        // no wall needs; this hands back something storable either way.
        let file = original;
        if (IMAGE_TYPES.test(original.type)) {
          const ready = await prepareImage(original);
          if ("error" in ready) {
            setNotice(ready.error);
            continue;
          }
          file = ready.file;
        }

        const z = topZ(Object.values(useRoomStore.getState().items));
        const where = { x: at.x + offset, y: at.y + offset };

        // A big PDF goes up in parts, which a plain upload would refuse.
        if (file.type === PDF_TYPE) {
          const up = await uploadPdf(file, uploadFile);
          if ("error" in up) {
            setNotice(up.error);
            continue;
          }
          await createItem(draftItem("pdf", where, z, { data: { ...up, name: file.name.replace(/\.pdf$/i, "") } }));
          offset += 26;
          continue;
        }

        const url = await uploadFile(file);
        if (!url) continue;

        if (IMAGE_TYPES.test(file.type)) {
          await createItem(draftItem("image", where, z, { data: { url } }));
        } else {
          const playable = parseMediaLink(url);
          const name = file.name.replace(/\.[^.]+$/, "");
          await createItem(
            draftItem("media", where, z, {
              data: newQueue(
                {
                  provider: playable?.provider ?? (file.type.startsWith("video/") ? "video" : "audio"),
                  ref: url,
                  title: name,
                },
                useRoomStore.getState().me?.name ?? "someone",
              ),
            }),
          );
        }
        offset += 26;
      }
    },
    [createItem, setNotice, uploadFile],
  );

  const acceptText = useCallback(
    async (text: string, at: { x: number; y: number }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const z = topZ(Object.values(useRoomStore.getState().items));

      // A playable, syncable link (youtube / audio file / soundcloud) opens in
      // the music player; other providers fall through to the site window.
      const playable = parseMediaLink(trimmed);
      if (playable) {
        await createItem(
          draftItem("media", at, z, {
            data: newQueue(playable, useRoomStore.getState().me?.name ?? "someone"),
          }),
        );
        return;
      }

      const resolved = resolveLink(trimmed);

      if (resolved?.kind === "image") {
        await createItem(draftItem("image", at, z, { data: { url: resolved.url } }));
        return;
      }

      if (resolved?.kind === "embed") {
        await createItem(
          draftItem("embed", at, z, { data: { url: resolved.url, title: resolved.title } }),
        );
        return;
      }

      await createItem(draftItem("note", at, z, { data: { body: trimmed.slice(0, 600) } }));
    },
    [createItem],
  );

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDropping(false);
      if (!canEdit) return;

      const at = placeAt(event.clientX, event.clientY);
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length > 0) {
        await acceptFiles(files, at);
        return;
      }

      const text = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
      if (text) await acceptText(text, at);
    },
    [acceptFiles, acceptText, canEdit, placeAt],
  );

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      if (!canEdit) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      const at = {
        x: (window.innerWidth / 2 - useRoomStore.getState().viewport.x) /
          useRoomStore.getState().viewport.scale,
        y: (window.innerHeight / 2 - useRoomStore.getState().viewport.y) /
          useRoomStore.getState().viewport.scale,
      };

      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        await acceptFiles(files, at);
        return;
      }

      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        event.preventDefault();
        await acceptText(text, at);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFiles, acceptText, canEdit]);

  const cursor = spaceHeld || panning ? "grabbing" : "default";

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 touch-none overflow-clip select-none"
      style={{ cursor }}
      onPointerDownCapture={stamp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDragOver={(event) => {
        event.preventDefault();
        if (canEdit) setDropping(true);
      }}
      onDragLeave={(event) => {
        if (event.target === event.currentTarget) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <Wall background={room?.background} />
      {room?.background.kind === "image" && (room.background.dim ?? 0) > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `rgb(16 13 22 / ${(room.background.dim ?? 0) / 100})` }}
        />
      )}

      <World>
        {items.map((item) => (
          <ItemFrame
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            picked={pickedSet.has(item.id)}
            editing={editingId === item.id}
          />
        ))}
        <RoomInkLayer />
        <Cursors />
        <PingLayer />
      </World>

      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-md border border-dashed border-glow bg-glow/10"
          style={{
            left: Math.min(box.x0, box.x1),
            top: Math.min(box.y0, box.y1),
            width: Math.abs(box.x1 - box.x0),
            height: Math.abs(box.y1 - box.y0),
          }}
        />
      )}

      {/* Space is held to pan, so the ink surface steps aside for it. */}
      {tool !== "select" && !spaceHeld && <InkOverlay />}

      {tool !== "select" && (
        <button
          type="button"
          onClick={() => useRoomStore.getState().setTool("select")}
          className="surface animate-drift-in pointer-events-auto absolute top-16 left-1/2 z-40 flex min-h-9 w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium sm:top-28"
        >
          <span className="size-1.5 rounded-full bg-glow" />
          {tool === "draw" ? t("drawing") : t("erasing")}{" "}{t("— tap here to stop")}</button>
      )}

      {reaction && tool === "select" && (
        <button
          type="button"
          onClick={() => useRoomStore.getState().setReaction(null)}
          className="surface animate-drift-in pointer-events-auto absolute top-16 left-1/2 z-40 flex min-h-9 w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium sm:top-28"
        >
          <span className="text-base leading-none">{reaction}</span>{t("tap the room to drop it — tap here to stop")}</button>
      )}

      {dropping && <DropVeil />}
    </div>
  );
}

/**
 * The room's contents, moved and scaled with the camera. Only this follows
 * the camera, so panning and zooming move one element instead of drawing the
 * whole room again every frame.
 */
function World({ children }: { children: React.ReactNode }) {
  const viewport = useRoomStore((s) => s.viewport);
  return (
    <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})` }}>
      {children}
    </div>
  );
}

/** The walls. A tiled picture scrolls with the camera; anything else sits still and never redraws. */
function Wall({ background }: { background: Background | undefined }) {
  const tiled = background?.kind === "image" && background.fit === "tile";
  const viewport = useRoomStore((s) => (tiled ? s.viewport : null));
  return <div aria-hidden className="pointer-events-none absolute inset-0" style={backgroundStyle(background, viewport ?? { x: 0, y: 0, scale: 1 })} />;
}

function backgroundStyle(
  background: Background | undefined,
  viewport: Viewport,
): React.CSSProperties {
  if (!background) return { background: "#171320" };

  switch (background.kind) {
    case "solid":
      return { background: background.color };

    case "gradient":
      return {
        background: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
      };

    case "image": {
      if (background.fit === "tile") {
        const size = Math.max(24, (background.scale ?? 240) * viewport.scale);
        return {
          backgroundImage: `url("${background.url}")`,
          backgroundRepeat: "repeat",
          backgroundSize: `${size}px`,
          // Tiling scrolls with the room so panning feels like moving across a wall.
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        };
      }
      return {
        backgroundImage: `url("${background.url}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }
  }
}
