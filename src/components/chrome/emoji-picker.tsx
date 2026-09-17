"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { EMOJI_GROUPS, emojiIn, searchEmoji, type EmojiGroup } from "@/lib/emoji";
import { REACTIONS, REACTION_GLYPHS } from "@/lib/reactions";

/** A face for each shelf, so the tabs read at a glance. */
const GROUP_FACE: Record<EmojiGroup, string> = {
  smileys: "😀",
  people: "👋",
  nature: "🐝",
  food: "🍕",
  travel: "🚀",
  activities: "🎉",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

const GROUP_NAME: Record<EmojiGroup, string> = {
  smileys: "smileys",
  people: "people",
  nature: "nature",
  food: "food and drink",
  travel: "travel",
  activities: "activities",
  objects: "objects",
  symbols: "symbols",
  flags: "flags",
};

const RECENT_KEY = "nook.recent-emoji";
const RECENT_MAX = 16;

/** What this browser reached for last. Never leaves the device. */
function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberRecent(glyph: string) {
  try {
    const next = [glyph, ...readRecent().filter((g) => g !== glyph)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private windows and blocked storage are not worth a broken picker.
  }
}

/**
 * Every emoji Unicode knows about, on nine shelves with a search across the
 * lot. Only the open shelf is rendered -- all 1900 at once is a lot of DOM to
 * drag around on a phone, and nobody scrolls through them anyway.
 */
export default function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (glyph: string) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [group, setGroup] = useState<EmojiGroup>("smileys");
  // Read on mount rather than up front: the picker only ever appears after a
  // click, so there is no server render of it to disagree with.
  const [recent, setRecent] = useState<string[]>(readRecent);
  const searchRef = useRef<HTMLInputElement>(null);

  const searching = term.trim().length > 0;
  const results = useMemo(
    () => (searching ? searchEmoji(term) : emojiIn(group)),
    [searching, term, group],
  );

  const quick = recent.length > 0 ? recent : REACTIONS.map((key) => REACTION_GLYPHS[key]);

  const pick = (glyph: string) => {
    rememberRecent(glyph);
    setRecent(readRecent());
    onPick(glyph);
  };

  return (
    <div className="surface-raised animate-drift-in fixed inset-x-2 bottom-[5.25rem] z-60 flex max-h-[62dvh] flex-col overflow-hidden rounded-2xl shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:mb-2 sm:max-h-[70dvh] sm:w-[20rem]">
      <div className="flex items-center gap-1.5 px-2 pt-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/7 px-2.5 ring-1 ring-white/10 focus-within:ring-glow/45">
          <Search className="size-3.5 shrink-0 text-muted" strokeWidth={2.2} />
          <input
            ref={searchRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                if (term) setTerm("");
                else onClose();
              }
              // Enter takes the best match, which is the whole point of typing.
              if (event.key === "Enter" && results.length > 0) pick(results[0].char);
            }}
            placeholder="search, in english or portugues"
            spellCheck={false}
            autoFocus
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-muted/55"
          />
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                searchRef.current?.focus();
              }}
              aria-label="clear the search"
              className="grid size-6 shrink-0 place-items-center rounded text-muted transition hover:text-chalk"
            >
              <X className="size-3.5" strokeWidth={2.6} />
            </button>
          )}
        </div>

        {/* A phone has no Escape key, and tapping past a sheet that covers most
            of the screen is not an obvious way out of it. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition active:bg-white/10 sm:hidden"
        >
          <X className="size-4" strokeWidth={2.4} />
        </button>
      </div>

      {!searching && (
        <>
          <p className="px-3 pt-2.5 text-[10px] tracking-wide text-muted/60 uppercase">
            {recent.length > 0 ? "you use these" : "to hand"}
          </p>
          <div className="grid grid-cols-8 gap-0.5 px-2 pt-1">
            {quick.map((glyph) => (
              <EmojiButton key={glyph} glyph={glyph} onPick={pick} />
            ))}
          </div>

          <div className="mt-2 flex items-center gap-0.5 border-t border-white/8 px-2 pt-1.5">
            {EMOJI_GROUPS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setGroup(id)}
                title={GROUP_NAME[id]}
                aria-label={GROUP_NAME[id]}
                className={clsx(
                  "grid aspect-square min-w-0 flex-1 place-items-center rounded-lg text-base transition",
                  group === id ? "bg-glow/22" : "opacity-55 hover:bg-white/8 hover:opacity-100",
                )}
              >
                {GROUP_FACE[id]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1.5 pb-2">
        {results.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted/60">
            nothing matches &ldquo;{term.trim()}&rdquo;
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {results.map((emoji) => (
              <EmojiButton
                key={emoji.char}
                glyph={emoji.char}
                title={emoji.name}
                onPick={pick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmojiButton({
  glyph,
  title,
  onPick,
}: {
  glyph: string;
  title?: string;
  onPick: (glyph: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(glyph)}
      title={title ?? glyph}
      aria-label={title ?? glyph}
      className="grid aspect-square place-items-center rounded-lg text-xl transition hover:scale-110 hover:bg-white/10"
    >
      {glyph}
    </button>
  );
}
