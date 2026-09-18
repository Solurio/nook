"use client";

import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useRoomStore } from "@/state/room-store";
import ItemRenderer from "@/components/items/item-renderer";
import ItemErrorBoundary from "@/components/canvas/item-error-boundary";
import type { AnyItem } from "@/lib/types";

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
      <div className="flex shrink-0 items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={close}
          className="flex min-h-11 items-center gap-1 rounded-xl pr-3 pl-1.5 text-sm font-medium text-chalk transition hover:bg-white/8"
        >
          <ChevronLeft className="size-5" strokeWidth={2.4} />
          back to the room
        </button>
        <span className="ml-auto pr-2 text-[11px] text-muted/60">{KIND_NAME[item.kind]}</span>
      </div>

      {/* The item gets everything that is left. Its own layout does the rest --
          they are all built to fill whatever box they are put in. */}
      <div className="min-h-0 flex-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="relative size-full">
          <ItemErrorBoundary resetKey={item.updated_at}>
            <ItemRenderer item={item} editing={editingId === item.id} selected={false} />
          </ItemErrorBoundary>
        </div>
      </div>
    </div>
  );
}
