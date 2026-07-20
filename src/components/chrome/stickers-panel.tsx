"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, Sticker, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { draftItem, topZ } from "@/lib/items";
import { giphyEnabled, searchGifs, trendingGifs, type Gif } from "@/lib/giphy";

/**
 * Type a word, get GIFs, drop one onto the wall as a sticker -- the Here.fm
 * move. Powered by Giphy; if no key is configured it says so instead of
 * failing silently.
 */
export default function StickersPanel() {
  const { createItem, canEdit } = useRoom();
  const setPanel = useRoomStore((s) => s.setPanel);

  const [term, setTerm] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const enabled = giphyEnabled();

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setFailed(false);
    try {
      const results = query.trim() ? await searchGifs(query) : await trendingGifs();
      setGifs(results);
    } catch {
      setFailed(true);
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Show trending on open; then debounce as the person types.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(term), term ? 350 : 0);
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

      // Keep the GIF's aspect ratio, capped to a friendly size.
      const ratio = gif.width / gif.height || 1;
      const width = Math.min(300, gif.width);
      const height = Math.round(width / ratio);

      const base = draftItem("image", at, z, {
        data: { url: gif.full, frame: "sticker", radius: 12 },
      });
      await createItem({ ...base, width, height });
    },
    [canEdit, createItem],
  );

  return (
    <aside className="surface animate-drift-in absolute top-16 right-3 bottom-20 z-40 flex w-[21rem] flex-col overflow-hidden rounded-3xl">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sticker className="size-4 text-glow" strokeWidth={2.2} />
          stickers
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
          <p>Pra buscar GIFs, o app precisa de uma chave gratuita do Giphy.</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs">
            <li>
              Pega uma em{" "}
              <span className="text-chalk">developers.giphy.com</span> (API key, leva 2 min).
            </li>
            <li>
              Adiciona <code className="rounded bg-white/8 px-1">NEXT_PUBLIC_GIPHY_KEY</code> nas
              variaveis de ambiente (Cloudflare/Vercel) e re-deploya.
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
                placeholder="search gifs"
                spellCheck={false}
                autoFocus
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted/55"
              />
              {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {failed ? (
              <p className="px-2 pt-6 text-center text-xs text-muted/70">
                Giphy nao respondeu. Tenta de novo.
              </p>
            ) : gifs.length === 0 && !loading ? (
              <p className="px-2 pt-6 text-center text-xs text-muted/70">nada encontrado.</p>
            ) : (
              <div className="columns-2 gap-2 [&>*]:mb-2">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => drop(gif)}
                    disabled={!canEdit}
                    className="block w-full overflow-hidden rounded-xl ring-1 ring-white/8 transition hover:ring-glow/60 disabled:opacity-50"
                    title="add to the room"
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

          <p className="border-t border-white/8 px-4 py-2 text-center text-[10px] text-muted/50">
            gifs via giphy
          </p>
        </>
      )}
    </aside>
  );
}
