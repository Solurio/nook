"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, Sticker, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { draftItem, topZ } from "@/lib/items";
import type { Gif, SourceReport } from "@/lib/gifs";
import { anyGifSource, enabledSources, explain, searchGifs } from "@/lib/gif-search";
import clsx from "clsx";

/**
 * Where to hang the panel so it sits above the button that opened it, without
 * running off either edge of the screen. Returns null when there is no button
 * on screen to point at -- on a phone the gif button lives in the add sheet,
 * so the panel falls back to a sheet of its own.
 */
function useAnchored(anchor?: React.RefObject<HTMLButtonElement | null>) {
  const [place, setPlace] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const button = anchor?.current;
      const rect = button?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        setPlace(null);
        return;
      }

      const width = Math.min(336, window.innerWidth - 16);
      const wanted = rect.left + rect.width / 2 - width / 2;
      setPlace({
        left: Math.max(8, Math.min(wanted, window.innerWidth - width - 8)),
        bottom: window.innerHeight - rect.top + 8,
      });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);

  return place;
}

/**
 * Type a word, get GIFs and stickers, drop one onto the wall -- the Here.fm
 * move. Searches every configured provider (Giphy + Klipy) at once so the
 * variety is wide; if one is thin on a term the others fill in.
 */
export default function StickersPanel({
  anchor,
}: {
  /** The dock button this hangs off. Absent on a phone, where it is a sheet. */
  anchor?: React.RefObject<HTMLButtonElement | null>;
}) {
  const { createItem, canEdit } = useRoom();
  const setPanel = useRoomStore((s) => s.setPanel);
  const place = useAnchored(anchor);

  const [term, setTerm] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<SourceReport[]>([]);
  const enabled = anyGifSource();
  const sources = enabledSources();
  const note = explain(reports);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const results = await searchGifs(query);
      setGifs(results.gifs);
      setReports(results.reports);
    } catch {
      setGifs([]);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Show trending on open; then debounce as the person types.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (debounce.current) clearTimeout(debounce.current);
    // A single letter matches everything and costs the same as a real search,
    // so it waits for a second one. The pause is generous on purpose: every
    // search spends requests from a daily allowance.
    const trimmed = term.trim();
    if (trimmed.length === 1) return;
    debounce.current = setTimeout(() => void load(term), trimmed ? 550 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [term, enabled, load]);

  const drop = useCallback(
    async (gif: Gif) => {
      if (!canEdit) return;
      const vp = useRoomStore.getState().viewport;
      const at = {
        x: (window.innerWidth / 2 - vp.x) / vp.scale + (Math.random() * 80 - 40),
        y: (window.innerHeight / 2 - vp.y) / vp.scale + (Math.random() * 80 - 40),
      };
      const z = topZ(Object.values(useRoomStore.getState().items));

      const ratio = gif.width / gif.height || 1;
      const width = Math.min(300, gif.width || 200);
      const height = Math.round(width / ratio);

      // Stickers are transparent, so they drop bare; gifs get a soft frame.
      const base = draftItem("image", at, z, {
        data: gif.sticker
          ? { url: gif.full, frame: "none", radius: 0 }
          : { url: gif.full, frame: "shadow", radius: 12 },
      });
      await createItem({ ...base, width, height });
    },
    [canEdit, createItem],
  );

  return (
    <aside
      style={place ?? undefined}
      className={clsx(
        "surface animate-drift-in pointer-events-auto z-60 flex flex-col overflow-hidden",
        place
          ? // Hung off the button, growing upwards from it.
            // It used to have no height limit at all, so a search that came
            // back with plenty grew the panel to the top of the screen.
            "fixed h-[min(25rem,52dvh)] w-[21rem] max-w-[92vw] rounded-2xl shadow-2xl"
          : // No button to point at: a sheet across the bottom instead.
            "fixed inset-x-2 bottom-20 h-[min(25rem,50dvh)] rounded-3xl",
      )}
    >
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sticker className="size-4 text-glow" strokeWidth={2.2} />
          gifs &amp; stickers
        </h2>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label="close"
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      {!enabled ? (
        <div className="flex-1 space-y-2 px-5 py-6 text-sm leading-relaxed text-muted">
          <p>Searching gifs and stickers needs at least one free key.</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs">
            <li>
              Grab one from <span className="text-chalk">tenor.com</span> (the most generous
              free allowance), <span className="text-chalk">developers.giphy.com</span> or{" "}
              <span className="text-chalk">partner.klipy.com</span>.
            </li>
            <li>
              Add <code className="rounded bg-white/8 px-1">NEXT_PUBLIC_TENOR_KEY</code>,{" "}
              <code className="rounded bg-white/8 px-1">NEXT_PUBLIC_GIPHY_KEY</code> or{" "}
              <code className="rounded bg-white/8 px-1">NEXT_PUBLIC_KLIPY_KEY</code> to your
              environment variables, then deploy again. More than one means a source running
              dry still leaves you with gifs.
            </li>
          </ol>
        </div>
      ) : (
        <>
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 rounded-xl bg-white/7 px-3 ring-1 ring-white/10 focus-within:ring-glow/45">
              <Search className="size-3.5 shrink-0 text-muted" strokeWidth={2.2} />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="search gifs and stickers"
                spellCheck={false}
                autoFocus
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted/55"
              />
              {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {gifs.length === 0 && !loading ? (
              <div className="px-3 pt-6 text-center">
                <p className="text-xs text-muted/70">
                  {note ?? (term.trim() ? "nothing turned up for that." : "nothing here yet.")}
                </p>
              </div>
            ) : (
              <div className="columns-2 gap-2 [&>*]:mb-2">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => drop(gif)}
                    disabled={!canEdit}
                    className={
                      "block w-full overflow-hidden rounded-xl ring-1 ring-white/8 transition hover:ring-glow/60 disabled:opacity-50 " +
                      // A soft checker helps transparent stickers read on dark.
                      (gif.sticker ? "bg-[repeating-conic-gradient(#2a2338_0_25%,#211b2e_0_50%)] bg-[length:16px_16px]" : "")
                    }
                    title={gif.sticker ? "add sticker" : "add gif"}
                  >
                    <img
                      src={gif.preview}
                      alt={gif.title}
                      loading="lazy"
                      className="w-full"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="border-t border-white/8 px-4 py-2 text-center text-[10px] leading-relaxed text-muted/50">
            {gifs.length > 0 && note ? note : sources.join(" + ")}
          </p>
        </>
      )}
    </aside>
  );
}
