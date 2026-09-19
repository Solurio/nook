// Decks people write for Cards Against Humanity, shared with everyone who uses
// the site (supabase/migrations/0007_decks.sql). This is the part that does
// not need a database: what a deck is, tidying one up, and whether it can be
// saved.

import { MAX_CARD, SAT_OUT, normalizePrompt } from "./cah";

export type DeckLanguage = "en" | "pt" | "es" | "other";

export const DECK_LANGUAGES: Record<DeckLanguage, string> = {
  en: "English",
  pt: "português",
  es: "español",
  other: "other",
};

export const DECK_NAME_MAX = 60;
export const DECK_MAX_BLACK = 1000;
export const DECK_MAX_WHITE = 2000;

/** What a list of decks carries: everything but the cards. */
export const DECK_META = "id, owner_id, author, name, language, adult, black_count, white_count, updated_at";

export interface DeckMeta {
  id: string;
  owner_id: string;
  author: string;
  name: string;
  language: DeckLanguage;
  adult: boolean;
  black_count: number;
  white_count: number;
  updated_at: string;
}

export interface DeckDraft {
  /** Set when it is a deck already saved, being changed. */
  id?: string;
  name: string;
  language: DeckLanguage;
  adult: boolean;
  black: string[];
  white: string[];
}

export const emptyDraft = (language: DeckLanguage = "en"): DeckDraft => ({ name: "", language, adult: false, black: [], white: [] });

function tidy(cards: string[], prompts: boolean, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cards) {
    const card = (prompts ? normalizePrompt(raw) : raw.replace(/\s+/g, " ").trim()).slice(0, MAX_CARD);
    const k = card.toLowerCase();
    if (!card || card === SAT_OUT || seen.has(k)) continue;
    seen.add(k);
    out.push(card);
  }
  return out.slice(0, max);
}

/** A deck as it will be saved: names trimmed, blanks written one way, no repeats. */
export function tidyDraft(draft: DeckDraft): DeckDraft {
  return {
    ...draft,
    name: draft.name.replace(/\s+/g, " ").trim().slice(0, DECK_NAME_MAX),
    black: tidy(draft.black, true, DECK_MAX_BLACK),
    white: tidy(draft.white, false, DECK_MAX_WHITE),
  };
}

/** Why a deck cannot be saved yet, if it cannot. */
export function draftProblem(draft: DeckDraft): string | null {
  const clean = tidyDraft(draft);
  if (!clean.name) return "give it a name";
  if (!clean.black.length && !clean.white.length) return "it has no cards yet";
  return null;
}

/** Adds a card to one side of a deck, or puts it in place of another. Returns the deck unchanged if it would repeat one. */
export function withCard(draft: DeckDraft, side: "black" | "white", text: string, replacing?: number): DeckDraft {
  const card = (side === "black" ? normalizePrompt(text) : text.replace(/\s+/g, " ").trim()).slice(0, MAX_CARD);
  if (!card) return draft;
  const list = [...draft[side]];
  const clash = list.findIndex((c, i) => c.toLowerCase() === card.toLowerCase() && i !== replacing);
  if (clash >= 0) return draft;
  if (replacing !== undefined && replacing >= 0 && replacing < list.length) list[replacing] = card;
  else list.unshift(card);
  return { ...draft, [side]: list };
}

export function withoutCard(draft: DeckDraft, side: "black" | "white", index: number): DeckDraft {
  return { ...draft, [side]: draft[side].filter((_, i) => i !== index) };
}

/** Pastes many cards at once, one to a line. */
export function withCards(draft: DeckDraft, side: "black" | "white", text: string): DeckDraft {
  const lines = text.split(/\r?\n/);
  return lines.reduce((d, line) => withCard(d, side, line), draft);
}

/** Turns what the database said into something a person can act on. */
export function explainDeckError(message: string | undefined | null): string {
  const text = message ?? "";
  if (/decks|relation|does not exist|PGRST205|schema cache/i.test(text) && /not|exist|find|cache/i.test(text)) {
    return "Shared decks need the newest database update. Run supabase/migrations/0007_decks.sql in the Supabase SQL editor.";
  }
  if (/row-level security|violates|permission/i.test(text)) return "Only whoever made a deck can change it. Make a copy instead.";
  if (/check constraint/i.test(text)) return "That deck is too big, or its name is too long.";
  return text || "The deck could not be saved.";
}

/** Whether an error just means the table is not there yet. */
export const decksMissing = (message: string | undefined | null) => /Run supabase\/migrations\/0007/.test(explainDeckError(message));
