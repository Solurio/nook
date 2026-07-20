"use client";

import { useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { resolveLink, withParent } from "@/lib/embeds";
import type { Item } from "@/lib/types";

/**
 * A generic window onto another page. Plenty of sites refuse to be framed, so
 * we always leave an escape hatch that opens the link in a new tab.
 */
export default function EmbedItem({
  item,
  selected,
}: {
  item: Item<"embed">;
  selected: boolean;
}) {
  const { canEdit, updateData } = useRoom();
  const [value, setValue] = useState("");
  const { url, title } = item.data;

  if (!url) {
    return (
      <div className="surface grid size-full place-items-center rounded-2xl p-5 text-center">
        {selected && canEdit ? (
          <form
            className="w-full max-w-[280px]"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = value.trim();
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
                title: resolved?.kind === "embed" ? resolved.title : item.data.title,
              });
            }}
          >
            <p className="mb-2 text-xs text-muted">what should live in this window?</p>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="https://"
              spellCheck={false}
              className="w-full rounded-xl bg-white/8 px-3 py-2 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/60 focus:ring-glow/50"
            />
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
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
        <Globe className="size-3.5 shrink-0 text-muted" strokeWidth={2.2} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {title ?? safeHost(url)}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="open in a new tab"
          className="shrink-0 text-muted transition hover:text-chalk"
        >
          <ExternalLink className="size-3.5" strokeWidth={2.2} />
        </a>
      </div>

      <iframe
        src={withParent(url)}
        title={title ?? safeHost(url)}
        className="min-h-0 flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
        referrerPolicy="no-referrer"
        loading="lazy"
      />

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
