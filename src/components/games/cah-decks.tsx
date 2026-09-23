"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Copy, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PACKS, type PackId } from "@/lib/cah-packs";
import { pickOf, type ExtraCards } from "@/lib/cah";
import {
  DECK_LANGUAGES,
  DECK_META,
  DECK_NAME_MAX,
  decksMissing,
  draftProblem,
  emptyDraft,
  explainDeckError,
  tidyDraft,
  withCard,
  withCards,
  withoutCard,
  type DeckDraft,
  type DeckLanguage,
  type DeckMeta,
} from "@/lib/decks";
import { BlackCard, WhiteCard } from "./cah-cards";
import { t as tx } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Talking to the table of decks
// ---------------------------------------------------------------------------

export type DecksStatus = "loading" | "ready" | "missing" | "error";

/** Every shared deck, without its cards. Read when the game opens and after a save. */
export function useSharedDecks() {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [status, setStatus] = useState<DecksStatus>("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void supabaseBrowser()
      .from("decks")
      .select(DECK_META)
      .order("updated_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatus(decksMissing(error.message) ? "missing" : "error");
          return;
        }
        setDecks((data ?? []) as DeckMeta[]);
        setStatus("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return { decks, status, reload: () => setTick((t) => t + 1) };
}

/** The cards of some decks, all together. */
export async function fetchDeckCards(ids: string[]): Promise<ExtraCards | { problem: string }> {
  if (!ids.length) return { black: [], white: [] };
  const { data, error } = await supabaseBrowser().from("decks").select("id, black, white").in("id", ids);
  if (error) return { problem: explainDeckError(error.message) };
  const rows = (data ?? []) as Array<{ black: string[]; white: string[] }>;
  return { black: rows.flatMap((r) => r.black ?? []), white: rows.flatMap((r) => r.white ?? []) };
}

async function fetchDeck(id: string): Promise<DeckDraft | null> {
  const { data } = await supabaseBrowser().from("decks").select("id, name, language, adult, black, white").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as DeckDraft & { id: string };
  return { id: row.id, name: row.name, language: row.language, adult: row.adult, black: row.black ?? [], white: row.white ?? [] };
}

// ---------------------------------------------------------------------------
// Picking what to play with
// ---------------------------------------------------------------------------

function Badge({ adult }: { adult?: boolean }) {
  if (!adult) return null;
  return <span className="rounded bg-[#e0655c]/20 px-1 text-[9px] font-bold text-[#f2a4b8]">18+</span>;
}

/**
 * The built-in packs and every deck anyone has saved, to tick for this table.
 * Your own decks open to be changed; anybody else's can be copied.
 */
export function DeckPicker({
  packs,
  chosen,
  decks,
  status,
  userId,
  canEdit,
  playing,
  onPack,
  onDeck,
  onEdit,
}: {
  packs: PackId[];
  chosen: string[];
  decks: DeckMeta[];
  status: DecksStatus;
  userId: string | null;
  canEdit: boolean;
  /** Mid-game, a deck can be added but not taken out, and the packs are fixed. */
  playing: boolean;
  onPack: (id: PackId) => void;
  onDeck: (id: string) => void;
  onEdit: (start: DeckDraft | { load: string; copy: boolean }) => void;
}) {
  const [query, setQuery] = useState("");
  const found = decks.filter((d) => !query || `${d.name} ${d.author}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex w-full max-w-md flex-col gap-2 text-left text-[11px]">
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{tx("built in")}</p>
        {(Object.keys(PACKS) as PackId[]).map((id) => (
          <label key={id} className={clsx("flex min-h-8 items-center gap-2", playing && "opacity-60")}>
            <input
              type="checkbox"
              checked={packs.includes(id)}
              disabled={!canEdit || playing}
              onChange={() => onPack(id)}
              className="size-4 accent-warm"
            />
            <span className="text-chalk">{PACKS[id].name}</span>
            <Badge adult={PACKS[id].adult} />
            <span className="ml-auto text-muted/60 tabular-nums">
              {PACKS[id].black.length} / {PACKS[id].white.length}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{tx("everyone's decks")}</p>
          {decks.length > 6 && (
            <span className="ml-auto flex items-center gap-1 rounded-lg bg-white/6 px-1.5">
              <Search className="size-3 text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx("find a deck")} className="h-7 w-28 bg-transparent text-[11px] text-chalk outline-none" />
            </span>
          )}
          <button
            type="button"
            disabled={!canEdit || status !== "ready"}
            onClick={() => onEdit(emptyDraft())}
            className={clsx("flex min-h-7 items-center gap-1 rounded-lg bg-warm/20 px-2 text-warm disabled:opacity-40", decks.length <= 6 && "ml-auto")}
          >
            <Plus className="size-3" />{" "}{tx("new deck")}</button>
        </div>
        {status === "loading" && <p className="text-muted/60">{tx("looking...")}</p>}
        {status === "missing" && (
          <p className="text-[#f2a4b8]">{tx("Shared decks need the newest database update: run supabase/migrations/0007_decks.sql in the Supabase SQL editor.")}</p>
        )}
        {status === "error" && <p className="text-[#f2a4b8]">{tx("The decks would not load. Try again in a moment.")}</p>}
        {status === "ready" && !decks.length && <p className="text-muted/60">{tx("nobody has made one yet -- be the first.")}</p>}
        <div className="flex max-h-56 flex-col overflow-y-auto">
          {found.map((d) => {
            const on = chosen.includes(d.id);
            const mine = d.owner_id === userId;
            return (
              <div key={d.id} className="flex min-h-8 items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canEdit || (playing && on)}
                  onChange={() => onDeck(d.id)}
                  className="size-4 shrink-0 accent-warm"
                  aria-label={tx(`play with ${d.name}`)}
                />
                <span className="min-w-0 truncate text-chalk">{d.name}</span>
                <Badge adult={d.adult} />
                <span className="shrink-0 text-muted/50">{DECK_LANGUAGES[d.language] ?? d.language}</span>
                {d.author && <span className="min-w-0 truncate text-muted/50">{tx("by")}{" "}{d.author}</span>}
                <span className="ml-auto shrink-0 text-muted/60 tabular-nums">
                  {d.black_count} / {d.white_count}
                </span>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onEdit({ load: d.id, copy: !mine })}
                  aria-label={mine ? tx(`change ${d.name}`) : tx(`copy ${d.name}`)}
                  title={mine ? tx("change it") : tx("make your own copy")}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-40"
                >
                  {mine ? <Pencil className="size-3" /> : <Copy className="size-3" />}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted/50">{tx("questions / answers. Decks are saved for everyone who uses the site.")}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Writing a deck
// ---------------------------------------------------------------------------

/**
 * A deck editor that feels like writing cards: type one, press enter, and it
 * lands on the pile in front of you. Tap a card to change it; paste a list to
 * add a lot at once; pour a whole built-in pack in to start from.
 */
export function DeckEditor({
  start,
  author,
  userId,
  onClose,
  onSaved,
}: {
  start: DeckDraft | { load: string; copy: boolean };
  author: string;
  userId: string | null;
  onClose: () => void;
  onSaved: (id: string | null) => void;
}) {
  const [draft, setDraft] = useState<DeckDraft>(() => ("load" in start ? emptyDraft() : start));
  const [loading, setLoading] = useState("load" in start);
  const [side, setSide] = useState<"black" | "white">("black");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  // A saved deck is fetched once, as it is now; a copy loses its id and gets a new name.
  const loadId = "load" in start ? start.load : null;
  const copying = "load" in start && start.copy;
  useEffect(() => {
    if (!loadId) return;
    let cancelled = false;
    void fetchDeck(loadId).then((deck) => {
      if (cancelled) return;
      if (deck) setDraft(copying ? { ...deck, id: undefined, name: `${deck.name} (copy)`.slice(0, DECK_NAME_MAX) } : deck);
      else setError("That deck is gone.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadId, copying]);

  const cards = draft[side];
  const problem = draftProblem(draft);
  const owned = Boolean(draft.id);

  const commit = () => {
    if (!text.trim()) return;
    const next = withCard(draft, side, text, editing ?? undefined);
    if (next === draft) {
      setError("that card is already in the deck");
      return;
    }
    setDraft(next);
    setText("");
    setEditing(null);
    setError(null);
    input.current?.focus();
  };

  const save = async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    const clean = tidyDraft(draft);
    const row = { author: author.slice(0, 40), name: clean.name, language: clean.language, adult: clean.adult, black: clean.black, white: clean.white };
    const db = supabaseBrowser().from("decks");
    const { data, error: saveError } = clean.id
      ? await db.update(row).eq("id", clean.id).select("id").maybeSingle()
      : await db.insert(row).select("id").maybeSingle();
    setBusy(false);
    if (saveError || !data) {
      setError(explainDeckError(saveError?.message ?? "Only whoever made a deck can change it. Make a copy instead."));
      return;
    }
    onSaved((data as { id: string }).id);
  };

  const remove = async () => {
    if (!draft.id) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    const { error: deleteError } = await supabaseBrowser().from("decks").delete().eq("id", draft.id);
    setBusy(false);
    if (deleteError) {
      setError(explainDeckError(deleteError.message));
      return;
    }
    onSaved(null);
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col gap-2 rounded-2xl bg-ink-950/97 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, DECK_NAME_MAX) })}
          placeholder={tx("name your deck")}
          className="min-h-9 min-w-0 flex-1 rounded-lg bg-white/6 px-2.5 text-[13px] font-semibold text-chalk outline-none ring-1 ring-white/10 focus:ring-warm/60"
        />
        <select
          value={draft.language}
          onChange={(e) => setDraft({ ...draft, language: e.target.value as DeckLanguage })}
          className="min-h-9 rounded-lg bg-white/6 px-1.5 text-[11px] text-chalk outline-none"
          aria-label={tx("language")}
        >
          {(Object.keys(DECK_LANGUAGES) as DeckLanguage[]).map((l) => (
            <option key={l} value={l} className="bg-ink-950">
              {DECK_LANGUAGES[l]}
            </option>
          ))}
        </select>
        <label className="flex min-h-9 items-center gap-1 rounded-lg bg-white/6 px-2 text-[11px] text-muted" title={tx("for grown-ups only")}>
          <input type="checkbox" checked={draft.adult} onChange={(e) => setDraft({ ...draft, adult: e.target.checked })} className="size-3.5 accent-[#e0655c]" />
          18+
        </label>
        <button type="button" onClick={onClose} aria-label={tx("close")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 text-[11px]">
        {(["black", "white"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSide(s);
              setEditing(null);
              setText("");
            }}
            className={clsx(
              "min-h-8 rounded-lg px-3 font-semibold",
              side === s ? (s === "black" ? "bg-[#121014] text-chalk ring-1 ring-white/20" : "bg-[#f4efe6] text-[#141117]") : "text-muted hover:bg-white/6",
            )}
          >
            {s === "black" ? tx("questions") : tx("answers")} <span className="tabular-nums opacity-60">{draft[s].length}</span>
          </button>
        ))}
        <select
          value=""
          onChange={(e) => {
            const pack = PACKS[e.target.value as PackId];
            if (!pack) return;
            setDraft(withCards(withCards(draft, "black", pack.black.join("\n")), "white", pack.white.join("\n")));
          }}
          className="ml-auto min-h-8 max-w-40 rounded-lg bg-white/6 px-1.5 text-[10px] text-muted outline-none"
          aria-label={tx("pour in a built-in pack")}
        >
          <option value="" className="bg-ink-950">{tx("start from a pack...")}</option>
          {(Object.keys(PACKS) as PackId[]).map((id) => (
            <option key={id} value={id} className="bg-ink-950">
              {PACKS[id].name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setBulk(bulk === null ? "" : null)} className="min-h-8 rounded-lg px-2 text-[10px] text-muted hover:bg-white/6 hover:text-chalk">{tx("paste a list")}</button>
      </div>

      {/* Writing one card, and how it will look */}
      {bulk === null ? (
        <div className="grid grid-cols-[1fr_9rem] items-start gap-2 max-sm:grid-cols-1">
          <div className="flex flex-col gap-1">
            <textarea
              ref={input}
              value={text}
              rows={2}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  setEditing(null);
                  setText("");
                }
              }}
              placeholder={side === "black" ? tx("a question. Type _ where the answer goes -- two of them ask for two.") : tx("an answer, as it would read on its own card.")}
              className={clsx(
                "resize-none rounded-lg p-2 text-[12px] outline-none focus:ring-2 focus:ring-warm/60",
                side === "black" ? "bg-[#121014] text-chalk ring-1 ring-white/10" : "bg-[#f4efe6] text-[#141117]",
              )}
            />
            <div className="flex items-center gap-1.5 text-[10px] text-muted">
              {editing !== null ? tx("changing a card -- Enter to keep it, Esc to leave it") : tx("Enter adds it")}
              {side === "black" && text.trim() && <span className="text-muted/70">{tx("· asks for")}{" "}{pickOf(text.replace(/_+/g, "____"))}</span>}
              <button type="button" disabled={!text.trim()} onClick={commit} className="ml-auto min-h-7 rounded-lg bg-chalk px-3 font-semibold text-ink-950 disabled:opacity-35">
                {editing !== null ? tx("keep") : tx("add")}
              </button>
            </div>
          </div>
          <div className="max-sm:hidden">
            {side === "black" ? (
              <BlackCard prompt={text.trim() ? text.replace(/_+/g, "____") : "your question here, ____."} small />
            ) : (
              <WhiteCard text={text.trim() || "your answer here."} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <textarea
            value={bulk}
            rows={4}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={tx(`one ${side === "black" ? "question" : "answer"} a line`)}
            className="resize-none rounded-lg bg-white/6 p-2 text-[12px] text-chalk outline-none ring-1 ring-white/10"
          />
          <button
            type="button"
            disabled={!bulk.trim()}
            onClick={() => {
              setDraft(withCards(draft, side, bulk));
              setBulk(null);
            }}
            className="min-h-8 self-end rounded-lg bg-chalk px-3 text-[11px] font-semibold text-ink-950 disabled:opacity-35"
          >{tx("add them all")}</button>
        </div>
      )}

      {/* The pile so far */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white/3 p-1.5">
        {loading ? (
          <p className="p-2 text-[11px] text-muted">{tx("fetching the deck...")}</p>
        ) : cards.length === 0 ? (
          <p className="p-2 text-[11px] text-muted/60">{tx("no")}{" "}{side === "black" ? tx("questions") : tx("answers")}{" "}{tx("yet.")}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1.5">
            {cards.map((card, i) => (
              <div key={`${i}:${card}`} className={clsx("group relative", editing === i && "rounded-xl ring-2 ring-warm")}>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(i);
                    setText(card);
                    input.current?.focus();
                  }}
                  className="block w-full text-left"
                  aria-label={tx("change this card")}
                >
                  {side === "black" ? <BlackCard prompt={card} small /> : <WhiteCard text={card} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(withoutCard(draft, side, i));
                    if (editing === i) {
                      setEditing(null);
                      setText("");
                    }
                  }}
                  aria-label={tx("take this card out")}
                  className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-ink-950 text-muted opacity-0 ring-1 ring-white/20 transition group-hover:opacity-100 hover:text-chalk max-sm:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
        <span>
          {draft.black.length}{" "}{tx("questions,")}{" "}{draft.white.length}{" "}{tx("answers")}{draft.adult && " · 18+"}
        </span>
        {(error || problem) && <span className="text-[#f2a4b8]">{error ?? problem}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {owned && userId && (
            <button type="button" disabled={busy} onClick={() => void remove()} className="flex min-h-9 items-center gap-1 rounded-xl px-2.5 text-[#f2a4b8] hover:bg-[#e0655c]/15">
              <Trash2 className="size-3.5" />
              {confirm ? tx("tap again to delete it") : tx("delete")}
            </button>
          )}
          <button
            type="button"
            disabled={busy || Boolean(problem) || loading}
            onClick={() => void save()}
            className="min-h-9 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-35"
          >
            {busy ? tx("saving...") : owned ? tx("save changes") : tx("save for everyone")}
          </button>
        </span>
      </div>
    </div>
  );
}
