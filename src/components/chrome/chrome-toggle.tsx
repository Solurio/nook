"use client";

import { useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useRoomStore } from "@/state/room-store";

const KEY = "nook.chromeHidden";

/**
 * Puts the room's bars and buttons away -- the top bar, the dock, the strip
 * over a selected thing and its handles -- so a game or a picture has the
 * whole screen. The button itself stays, small, in the corner. Remembered on
 * this device only. H does the same from the keyboard.
 */
export default function ChromeToggle() {
  const hidden = useRoomStore((s) => s.chromeHidden);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") useRoomStore.getState().setChromeHidden(true);
    } catch {
      // No storage: start with everything showing.
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      if (event.key.toLowerCase() !== "h" || event.ctrlKey || event.metaKey || event.altKey) return;
      toggle(!useRoomStore.getState().chromeHidden);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggle(next: boolean) {
    useRoomStore.getState().setChromeHidden(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Fine: it just will not be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={() => toggle(!hidden)}
      aria-label={hidden ? "show the buttons (H)" : "hide the buttons (H)"}
      title={hidden ? "show the buttons (H)" : "hide the buttons (H)"}
      className="fixed right-2.5 bottom-2.5 z-[70] grid size-10 place-items-center rounded-full bg-ink-950/70 text-muted shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition hover:text-chalk sm:size-9 max-sm:bottom-[4.5rem]"
    >
      {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </button>
  );
}
