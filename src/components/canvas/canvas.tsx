"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoom } from "@/realtime/room-provider";
import {
  orderItems,
  screenToWorld,
  useRoomStore,
  type Viewport,
} from "@/state/room-store";
import { draftItem, topZ } from "@/lib/items";
import { resolveLink } from "@/lib/embeds";
import { parseMediaLink } from "@/lib/media";
import type { Background } from "@/lib/types";
import ItemFrame from "./item-frame";
import Cursors from "./cursors";
import PingLayer from "./ping-layer";
import DropVeil from "./drop-veil";
import RoomInkLayer from "./room-ink-layer";
import InkOverlay from "./ink-overlay";

const IMAGE_TYPES = /^image\//;

export default function Canvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const room = useRoomStore((s) => s.room);
  const viewport = useRoomStore((s) => s.viewport);
  // Subscribe to the stable items map; the ordered array is derived here so the
  // store hook never returns a fresh reference on an unrelated update.
  const itemMap = useRoomStore((s) => s.items);
  const items = useMemo(() => orderItems(itemMap), [itemMap]);
  const select = useRoomStore((s) => s.select);
  const setEditing = useRoomStore((s) => s.setEditing);
  const selectedId = useRoomStore((s) => s.selectedId);
  const editingId = useRoomStore((s) => s.editingId);
  const tool = useRoomStore((s) => s.tool);
  const panBy = useRoomStore((s) => s.panBy);
  const zoomAt = useRoomStore((s) => s.zoomAt);

  const { moveCursor, createItem, deleteItem, duplicateItem, uploadFile, canEdit } = useRoom();

  const [dropping, setDropping] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const panState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  // ---------------------------------------------------------------------------
  // Pointer: pan the canvas, and tell everyone else where the cursor is.
  // ---------------------------------------------------------------------------

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const isBackground = event.target === event.currentTarget;
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

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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
    [moveCursor, panBy],
  );

  const endPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (panState.current?.pointerId !== event.pointerId) return;
    panState.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

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

      if (event.key === "Escape") {
        useRoomStore.getState().select(null);
        useRoomStore.getState().setEditing(null);
        useRoomStore.getState().setPanel(null);
        useRoomStore.getState().setTool("select");
        return;
      }

      // Quick tool switches, the way most canvas apps do it.
      if (event.key.toLowerCase() === "v") useRoomStore.getState().setTool("select");
      if (event.key.toLowerCase() === "b" && canEdit) useRoomStore.getState().setTool("draw");
      if (event.key.toLowerCase() === "e" && canEdit) useRoomStore.getState().setTool("erase");

      if ((event.key === "Delete" || event.key === "Backspace") && id && canEdit) {
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
      const images = files.filter((file) => IMAGE_TYPES.test(file.type));
      let offset = 0;

      for (const file of images) {
        const url = await uploadFile(file);
        if (!url) continue;
        const z = topZ(Object.values(useRoomStore.getState().items));
        await createItem(
          draftItem("image", { x: at.x + offset, y: at.y + offset }, z, { data: { url } }),
        );
        offset += 26;
      }
    },
    [createItem, uploadFile],
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
            data: {
              queue: [
                {
                  id: `${Date.now()}`,
                  provider: playable.provider,
                  ref: playable.ref,
                  title: playable.title,
                  addedBy: useRoomStore.getState().me?.name ?? "someone",
                },
              ],
              index: 0,
              playing: true,
              positionSec: 0,
              anchoredAt: Date.now(),
              volume: 60,
              audioOnly: playable.provider === "audio",
            },
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
      className="absolute inset-0 touch-none select-none"
      style={{ cursor, ...backgroundStyle(room?.background, viewport) }}
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
      {room?.background.kind === "image" && (room.background.dim ?? 0) > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `rgb(16 13 22 / ${(room.background.dim ?? 0) / 100})` }}
        />
      )}

      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
        }}
      >
        {items.map((item) => (
          <ItemFrame
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            editing={editingId === item.id}
          />
        ))}
        <RoomInkLayer />
        <Cursors />
        <PingLayer />
      </div>

      {/* Space is held to pan, so the ink surface steps aside for it. */}
      {tool !== "select" && !spaceHeld && <InkOverlay />}

      {tool !== "select" && (
        <button
          type="button"
          onClick={() => useRoomStore.getState().setTool("select")}
          className="surface animate-drift-in pointer-events-auto absolute top-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
        >
          <span className="size-1.5 rounded-full bg-glow" />
          {tool === "draw" ? "drawing" : "erasing"} &mdash; press Esc or tap to stop
        </button>
      )}

      {dropping && <DropVeil />}
    </div>
  );
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
