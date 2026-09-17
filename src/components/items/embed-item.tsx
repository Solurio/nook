"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe, RotateCw, ShieldAlert, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { blocksFraming, resolveLink, withParent } from "@/lib/embeds";
import type { Item } from "@/lib/types";

/**
 * A window onto another page that the whole room shares. The address is part of
 * the item, not of one person's browser, so when anyone types a new one the
 * window moves for everybody at once and latecomers arrive on the same page.
 *
 * Each person's browser renders the site itself, which is as far as this can go:
 * a page cannot read or drive what happens inside a frame from another domain,
 * so scrolling and clicks stay local. For driving one page together there is the
 * shared browser, and for showing what you are doing there is tab sharing.
 */
export default function EmbedItem({
  item,
  selected,
}: {
  item: Item<"embed">;
  selected: boolean;
}) {
  const { canEdit, updateData } = useRoom();
  const me = useRoomStore((s) => s.me);
  const { url, title, openedBy, navigatedAt } = item.data;

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // A remote navigation should land here too, so the frame is keyed on when the
  // address last changed as well as on the address itself.
  const lastNav = useRef(navigatedAt);
  useEffect(() => {
    if (navigatedAt !== lastNav.current) {
      lastNav.current = navigatedAt;
      setReloadKey((k) => k + 1);
    }
  }, [navigatedAt]);

  const go = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Turn a normal twitch/vimeo/etc. link into its embeddable form.
    const resolved = resolveLink(trimmed);
    const next =
      resolved?.kind === "embed"
        ? resolved.url
        : /^https?:\/\//i.test(trimmed)
          ? trimmed
          : `https://${trimmed}`;

    void updateData(item.id, {
      ...item.data,
      url: next,
      title: resolved?.kind === "embed" ? resolved.title : undefined,
      openedBy: me?.name ?? "someone",
      navigatedAt: Date.now(),
    });
    setEditing(false);
    setDraft("");
  };

  if (!url) {
    return (
      <div className="surface grid size-full place-items-center rounded-2xl p-5 text-center">
        {selected && canEdit ? (
          <form
            className="w-full max-w-[280px]"
            onSubmit={(event) => {
              event.preventDefault();
              go(draft);
            }}
          >
            <p className="mb-2 text-xs text-muted">what should live in this window?</p>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="https://"
              spellCheck={false}
              className="w-full rounded-xl bg-white/8 px-3 py-2 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/60 focus:ring-glow/50"
            />
            <p className="mt-2 text-[10px] leading-relaxed text-muted/60">
              everyone in the room gets this window, on the same page.
            </p>
          </form>
        ) : (
          <div className="text-muted">
            <Globe className="mx-auto mb-2 size-5" strokeWidth={1.8} />
            <p className="text-xs">an empty window</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="surface relative flex size-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-1.5 border-b border-white/8 px-2 py-1.5">
        <Globe className="size-3.5 shrink-0 text-muted" strokeWidth={2.2} />

        {editing && canEdit ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              go(draft);
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") setEditing(false);
              }}
              placeholder="go somewhere else"
              spellCheck={false}
              autoFocus
              className="min-w-0 flex-1 rounded-lg bg-white/8 px-2 py-1 text-[11px] ring-1 ring-white/12 outline-none focus:ring-glow/50"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-glow/25 px-2 py-1 text-[11px] font-medium text-glow"
            >
              go
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="cancel"
              className="grid size-6 shrink-0 place-items-center rounded-lg text-muted hover:text-chalk"
            >
              <X className="size-3.5" strokeWidth={2.2} />
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                setDraft(url);
                setEditing(true);
              }}
              title={canEdit ? "go somewhere else, for everyone" : url}
              className="min-w-0 flex-1 truncate text-left text-[11px] text-muted transition hover:text-chalk disabled:hover:text-muted"
            >
              {title ?? safeHost(url)}
              {openedBy && <span className="text-muted/50"> {"·"} opened by {openedBy}</span>}
            </button>

            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              aria-label="reload"
              title="reload"
              className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
            >
              <RotateCw className="size-3.5" strokeWidth={2.2} />
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="open in a new tab"
              className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
            >
              <ExternalLink className="size-3.5" strokeWidth={2.2} />
            </a>
          </>
        )}
      </div>

      {blocksFraming(url) ? (
        <div className="grid min-h-0 flex-1 place-items-center bg-ink-900 px-6 text-center">
          <div className="max-w-[280px] space-y-2 text-muted">
            <ShieldAlert className="mx-auto size-5 text-warm" strokeWidth={1.8} />
            <p className="text-xs leading-relaxed">
              <span className="text-chalk">{safeHost(url)}</span> will not open inside another page
              (the site blocks it). Open it in a new tab, or use the{" "}
              <span className="text-chalk">shared browser</span> to watch it together.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1 text-[11px] text-chalk transition hover:bg-white/12"
            >
              <ExternalLink className="size-3" strokeWidth={2.2} />
              open in a tab
            </a>
          </div>
        </div>
      ) : (
        <iframe
          key={`${url}#${reloadKey}`}
          src={withParent(url)}
          title={title ?? safeHost(url)}
          className="min-h-0 flex-1 bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          referrerPolicy="no-referrer"
        />
      )}

      {/* While the item is unselected the iframe should not swallow drags. */}
      {!selected && <div className="absolute inset-0 top-9" />}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
