// Bomb Party. A bomb goes round the table with a few letters on it; whoever
// holds it has to type a word with those letters in it before it goes off,
// and a word said once is gone for the rest of the game. Run out of lives and
// you are out; the last one left wins.
//
// This is the foundation: English, Portuguese and Spanish prompts, the fuse,
// lives and turns. A word is taken on trust as long as it has the letters,
// is made of letters, and has not been used -- there is no dictionary behind
// it yet, so the table is the judge.

import { fold } from "./pdf";

export type Language = "en" | "pt" | "es";

export const LANGUAGE_NAME: Record<Language, string> = { en: "English", pt: "Português", es: "Español" };

/** Letter runs common enough that most people can think of a word, and uncommon enough that it takes a moment. */
export const PROMPTS: Record<Language, string[]> = {
  en: [
    "ing", "tion", "er", "an", "re", "on", "at", "en", "nd", "ti", "es", "or", "te", "ed", "is", "it", "al", "ar", "st",
    "nt", "ng", "se", "ha", "ou", "io", "le", "ve", "co", "me", "de", "hi", "ri", "ro", "ic", "ne", "ea", "ra", "ce",
    "li", "ch", "ll", "be", "ma", "si", "om", "ur", "ca", "el", "ta", "la", "ns", "ge", "ly", "ei", "ss", "ck", "ow",
    "ph", "qu", "ght", "ous", "ble", "ent", "ist", "ate", "and", "ter", "ies", "ver", "pro", "con", "per", "man",
  ],
  pt: [
    "ao", "cao", "nh", "lh", "ar", "er", "or", "as", "os", "es", "ra", "re", "ri", "ro", "ta", "te", "ti", "to", "ma",
    "me", "mi", "mo", "ca", "co", "de", "do", "da", "se", "si", "so", "la", "le", "li", "lo", "pa", "pe", "po", "ga",
    "go", "an", "en", "in", "on", "un", "ent", "nte", "ado", "ida", "oes", "mente", "gu", "qu", "ch", "rr", "ss", "ei",
    "ou", "ui", "tr", "pr", "br", "cr", "dor", "vel", "ist", "inh", "zer", "ano", "eir",
  ],
  es: [
    "ar", "er", "ir", "ci", "on", "ll", "rr", "qu", "gu", "ue", "ie", "io", "ia", "ad", "es", "as", "os", "en", "an",
    "un", "ta", "to", "te", "ra", "re", "ro", "la", "le", "lo", "ca", "co", "ma", "me", "mo", "pa", "pe", "po", "sa",
    "se", "so", "ni", "no", "na", "do", "da", "de", "ch", "cion", "mente", "ado", "ido", "dor", "ero", "tr", "pr", "br",
    "gr", "cr", "nte", "ent", "ist", "ble", "iz", "ez", "anz", "ano", "ita", "illo",
  ],
};

export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
export const MIN_WORD = 3;
export const USED_MAX = 400;
/** The fuse: some seconds, never the same twice, never shown exactly. */
export const FUSE_MIN = 8;
export const FUSE_SPREAD = 9;

export interface BombState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  language: Language;
  startLives: number;
  phase: "idle" | "play" | "over";
  lives: Record<string, number>;
  order: string[];
  turn: string;
  prompt: string;
  /** When the bomb goes off, in the clock of whoever lit it. */
  fuseEnds: number;
  /** Turns and bangs so far, so a stale device never settles a bomb twice. */
  tick: number;
  used: string[];
  last: { chair: string; word: string } | null;
  lastBang: { chair: string; tick: number } | null;
  winner?: string;
  wins: Record<string, number>;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

export function emptyBomb(seatCount = 4): BombState {
  return {
    version: 1,
    seats: {},
    holders: {},
    seatCount,
    language: "en",
    startLives: 2,
    phase: "idle",
    lives: {},
    order: [],
    turn: "s0",
    prompt: "",
    fuseEnds: 0,
    tick: 0,
    used: [],
    last: null,
    lastBang: null,
    wins: {},
  };
}

type Random = (max: number) => number;

/** The time now, for fuses. Kept here so the table reads the clock only when something happens. */
export const clock = () => Date.now();

export const pickPrompt = (language: Language, random: Random, not?: string) => {
  const list = PROMPTS[language].filter((p) => p !== not);
  return list[random(list.length)];
};
export const fuseFrom = (now: number, random: Random) => now + (FUSE_MIN + random(FUSE_SPREAD)) * 1000;

export function start(state: BombState, chairs: string[], now: number, random: Random): BombState {
  return {
    ...state,
    phase: "play",
    lives: Object.fromEntries(chairs.map((c) => [c, state.startLives])),
    order: chairs,
    turn: chairs[random(chairs.length)],
    prompt: pickPrompt(state.language, random),
    fuseEnds: fuseFrom(now, random),
    tick: state.tick + 1,
    used: [],
    last: null,
    lastBang: null,
    winner: undefined,
  };
}

export const alive = (state: BombState) => state.order.filter((c) => (state.lives[c] ?? 0) > 0);

function nextOf(state: BombState, from: string): string {
  const ring = state.order;
  const at = ring.indexOf(from);
  for (let step = 1; step <= ring.length; step += 1) {
    const c = ring[(at + step) % ring.length];
    if ((state.lives[c] ?? 0) > 0) return c;
  }
  return from;
}

/** Only letters -- accents welcome -- and the odd hyphen or apostrophe inside. */
const WORDY = /^\p{L}[\p{L}'-]*\p{L}$/u;

export type Verdict = { ok: true; word: string } | { ok: false; why: string };

export function judge(state: BombState, raw: string): Verdict {
  const word = raw.trim().toLowerCase();
  if (word.length < MIN_WORD) return { ok: false, why: "too short" };
  if (!WORDY.test(word)) return { ok: false, why: "letters only" };
  const folded = fold(word);
  if (!folded.includes(fold(state.prompt))) return { ok: false, why: `needs "${state.prompt.toUpperCase()}"` };
  if (state.used.includes(folded)) return { ok: false, why: "already said" };
  return { ok: true, word };
}

/** A good word: the bomb moves on, with new letters and a new fuse. */
export function accept(state: BombState, word: string, now: number, random: Random): BombState {
  return {
    ...state,
    used: [...state.used, fold(word)].slice(-USED_MAX),
    last: { chair: state.turn, word },
    turn: nextOf(state, state.turn),
    prompt: pickPrompt(state.language, random, state.prompt),
    fuseEnds: fuseFrom(now, random),
    tick: state.tick + 1,
  };
}

/** The fuse ran out: a life gone, and the bomb goes on -- or the game is over. */
export function explode(state: BombState, now: number, random: Random): BombState {
  const who = state.turn;
  const lives = { ...state.lives, [who]: Math.max(0, (state.lives[who] ?? 0) - 1) };
  const next: BombState = { ...state, lives, lastBang: { chair: who, tick: state.tick }, tick: state.tick + 1 };
  const standing = alive(next);
  if (standing.length <= 1) {
    const winner = standing[0] ?? who;
    return { ...next, phase: "over", winner, wins: { ...state.wins, [winner]: (state.wins[winner] ?? 0) + 1 } };
  }
  return {
    ...next,
    turn: nextOf(next, who),
    prompt: pickPrompt(state.language, random, state.prompt),
    fuseEnds: fuseFrom(now, random),
  };
}
