"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ZoomIn, ZoomOut } from "lucide-react";
import { useRoomStore } from "@/state/room-store";
import ItemRenderer from "@/components/items/item-renderer";
import ItemErrorBoundary from "@/components/canvas/item-error-boundary";
import type { AnyItem } from "@/lib/types";
import { t } from "@/lib/i18n";
import { gameTitle } from "@/components/chrome/dock";
import { IDENTITY, MAX_ZOOM, pinchView, zoomAbout, type ZoomView } from "@/lib/zoom";

/** What to call the thing on the back bar. */
const KIND_NAME: Record<AnyItem["kind"], string> = {
  image: "picture",
  note: "note",
  text: "text",
  media: "player",
  embed: "window",
  game: "game",
  cobrowse: "shared browser",
  screencast: "shared tab",
  pdf: "document",
  token: "piece",
  grid: "grid",
};

/**
 * One item, given the whole screen.
 *
 * A room fitted onto a phone draws a board built for a desk at about a third
 * of its size: legible to nobody, and tapping the right square is guesswork.
 * Zooming in trades that for seeing a quarter of the board. Neither is a way
 * to play a game. So the canvas stops being involved -- the item is handed the
 * display, laid out at a size it was designed for, and handed back.
 *
 * The same component covers the desktop, where it is a quieter win: a large
 * board without having to arrange the room around it.
 */
export default function FocusView() {
  const focusedId = useRoomStore((s) => s.focusedId);
  const item = useRoomStore((s) => (s.focusedId ? s.items[s.focusedId] : undefined));
  const editingId = useRoomStore((s) => s.editingId);
  const focus = useRoomStore((s) => s.focus);

  // Back closes it rather than leaving the room, which is what the gesture
  // means here -- and what a phone's back swipe should do.
  useEffect(() => {
    if (!focusedId) return;
    window.history.pushState({ nookFocus: focusedId }, "");
    const onPop = () => focus(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [focusedId, focus]);

  useEffect(() => {
    if (!focusedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A note being typed into wants Escape for itself.
      if (useRoomStore.getState().editingId) return;
      focus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, focus]);

  if (!focusedId || !item) return null;

  const close = () => {
    // Unwind the entry we pushed, which fires popstate and clears the focus.
    if (window.history.state?.nookFocus === focusedId) window.history.back();
    else focus(null);
  };

  return (
    <div className="animate-drift-in fixed inset-0 z-70 flex flex-col bg-ink-950">
      <ZoomedItem key={item.id} item={item} editing={editingId === item.id} onClose={close} />
    </div>
  );
}

interface Finger {
  x: number;
  y: number;
  target: EventTarget | null;
}

/**
 * The item itself, which two fingers (or ctrl and the wheel) can zoom into:
 * a world map or a Catan board on a phone is the whole board at a glance, and
 * a territory is a fingertip only once you are closer. One finger still plays.
 */
function ZoomedItem({ item, editing, onClose }: { item: AnyItem; editing: boolean; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ZoomView>(IDENTITY);

  const fingers = useRef(new Map<number, Finger>());
  const pinch = useRef<{ start: ZoomView; spread: number; mid: { x: number; y: number } } | null>(null);
  /** Fingers that belong to a pinch, whose every move is kept from the item. */
  const held = useRef(new Set<number>());
  /** The one cancel we send ourselves, which has to reach the item. */
  const cancelling = useRef<number | null>(null);

  const sizeOf = () => ({ width: box.current?.clientWidth || 1, height: box.current?.clientHeight || 1 });
  const local = (event: { clientX: number; clientY: number }) => {
    const rect = box.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const spreadOf = () => {
    const [a, b] = [...fingers.current.values()];
    return { spread: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  // Ctrl and the wheel (a trackpad pinch arrives as this too). Not passive,
  // so the page itself does not zoom instead.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const size = { width: node.clientWidth || 1, height: node.clientHeight || 1 };
      setView((v) => zoomAbout(v, Math.exp(-event.deltaY * 0.01), at, size));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const down = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    fingers.current.set(event.pointerId, { ...local(event), target: event.target });
    if (fingers.current.size === 2 && held.current.size === 0) {
      // The first finger already went to whatever it landed on. Take it back
      // before it becomes a drag, a shot or a move.
      for (const [id, finger] of fingers.current) {
        if (id === event.pointerId) continue;
        cancelling.current = id;
        finger.target?.dispatchEvent(new PointerEvent("pointercancel", { pointerId: id, pointerType: "touch", bubbles: true }));
        cancelling.current = null;
        held.current.add(id);
      }
      held.current.add(event.pointerId);
      const { spread, mid } = spreadOf();
      pinch.current = { start: view, spread, mid };
      event.stopPropagation();
    } else if (held.current.size > 0) {
      // A third finger, or one landing while a pinch's last finger is still down.
      held.current.add(event.pointerId);
      event.stopPropagation();
    }
  };

  const move = (event: React.PointerEvent) => {
    const finger = fingers.current.get(event.pointerId);
    if (!finger) return;
    const at = local(event);
    finger.x = at.x;
    finger.y = at.y;
    if (!held.current.has(event.pointerId)) return;
    event.stopPropagation();
    const started = pinch.current;
    if (!started || fingers.current.size < 2) return;
    const { spread, mid } = spreadOf();
    setView(pinchView(started.start, started.spread, spread, started.mid, mid, sizeOf()));
  };

  const up = (event: React.PointerEvent) => {
    if (cancelling.current === event.pointerId) return;
    fingers.current.delete(event.pointerId);
    if (!held.current.has(event.pointerId)) return;
    held.current.delete(event.pointerId);
    event.stopPropagation();
    if (fingers.current.size < 2) pinch.current = null;
  };

  const zoomBy = (factor: number) => {
    const size = sizeOf();
    setView((v) => zoomAbout(v, factor, { x: size.width / 2, y: size.height / 2 }, size));
  };

  // Laid out unturned here, so a game reading the pointer must not undo the
  // tilt the item has out in the room.
  const upright = useMemo(() => ({ ...item, rotation: 0 }) as AnyItem, [item]);
  const zoomed = view.scale > 1.001;

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-11 items-center gap-1 rounded-xl pr-3 pl-1.5 text-sm font-medium text-chalk transition hover:bg-white/8"
        >
          <ChevronLeft className="size-5" strokeWidth={2.4} />{t("back to the room")}</button>
        <span className="ml-auto truncate pr-1 text-[11px] text-muted/60">{item.kind === "game" ? t(gameTitle((item.data as { game: string }).game)) : t(KIND_NAME[item.kind])}</span>
        <div className="flex shrink-0 items-center rounded-xl bg-white/5">
          <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={!zoomed} aria-label={t("zoom out")} className="grid size-9 place-items-center rounded-xl text-muted transition hover:text-chalk disabled:opacity-30">
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setView(IDENTITY)}
            disabled={!zoomed}
            title={t("fit it to the screen")}
            className="min-w-11 text-[11px] text-muted tabular-nums transition hover:text-chalk disabled:opacity-60"
          >
            {Math.round(view.scale * 100)}%
          </button>
          <button type="button" onClick={() => zoomBy(1.5)} disabled={view.scale >= MAX_ZOOM} aria-label={t("zoom in")} className="grid size-9 place-items-center rounded-xl text-muted transition hover:text-chalk disabled:opacity-30">
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>

      {/* The item gets everything that is left. Its own layout does the rest --
          they are all built to fill whatever box they are put in. */}
      <div className="min-h-0 flex-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div
          ref={box}
          className="relative size-full overflow-hidden"
          onPointerDownCapture={down}
          onPointerMoveCapture={move}
          onPointerUpCapture={up}
          onPointerCancelCapture={up}
        >
          <div
            className="absolute inset-0 origin-top-left"
            style={zoomed ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` } : undefined}
          >
            <ItemErrorBoundary resetKey={item.updated_at}>
              <ItemRenderer item={upright} editing={editing} selected={false} />
            </ItemErrorBoundary>
          </div>
        </div>
      </div>
    </>
  );
}
