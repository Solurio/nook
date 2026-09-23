"use client";

import { useEffect } from "react";
import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { useRoomStore } from "@/state/room-store";
import { t } from "@/lib/i18n";

const KEY = "nook.chromeHidden";

/**
 * Puts the room's bars and buttons away -- the top bar, the dock, the strip
 * over a selected thing and its handles -- so a game or a picture has the
 * whole screen. The button itself stays, small, in the corner. Remembered on
 * this device only. H does the same from the keyboard.
 *
 * On a phone the corner is where the sheets and panels come up, so while the
 * buttons are showing this one lives in the top bar's "more" sheet instead,
 * and only comes out once everything else has gone.
 */
export function hideChrome(next: boolean) {
  useRoomStore.getState().setChromeHidden(next);
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // Fine: it just will not be remembered.
  }
}

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
      hideChrome(!useRoomStore.getState().chromeHidden);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={() => hideChrome(!hidden)}
      aria-label={hidden ? t("show the buttons (H)") : t("hide the buttons (H)")}
      title={hidden ? t("show the buttons (H)") : t("hide the buttons (H)")}
      className={clsx(
        "fixed right-2.5 bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-[70] grid size-10 place-items-center rounded-full bg-ink-950/70 text-muted shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition hover:text-chalk sm:size-9",
        !hidden && "max-sm:hidden",
      )}
    >
      {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </button>
  );
}
