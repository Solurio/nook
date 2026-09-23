// The words on screen, in the language the visitor picked.
//
// The English is the key: t("sit here") reads as what it says, and a phrase
// nobody has translated yet simply shows in English. The other languages are
// tables from the English to theirs, each fetched only when someone picks it,
// so English readers never download them.
//
// Changing language redraws the interface from the top (see Localized), so a
// plain function is enough here: nothing has to subscribe to anything.

import { useSyncExternalStore } from "react";

export type Lang = "en" | "pt" | "es";

export const LANGUAGES: Array<{ id: Lang; name: string; short: string }> = [
  { id: "en", name: "English", short: "EN" },
  { id: "pt", name: "Português", short: "PT" },
  { id: "es", name: "Español", short: "ES" },
];

type Table = Record<string, string>;

const KEY = "nook.lang";
const loaded: Partial<Record<Lang, Table>> = { en: {} };
const listeners = new Set<() => void>();

/** What the visitor has picked, once it has been read and its words have arrived. */
let chosen: Lang = "en";
/** The table the interface is being drawn with right now. */
let table: Table | null = null;

export type Vars = Record<string, string | number>;

const fill = (text: string, vars: Vars) => text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));

/**
 * Phrases that have something filled in -- "{name} is thinking" -- worked out
 * once per table as patterns, so a sentence put together elsewhere with a name
 * or a number in it still finds its translation.
 */
interface Pattern {
  match: RegExp;
  names: string[];
  into: string;
}
const patterns = new WeakMap<Table, Pattern[]>();
const answers = new WeakMap<Table, Map<string, string>>();

function patternsOf(of: Table): Pattern[] {
  let list = patterns.get(of);
  if (list) return list;
  list = [];
  for (const [key, into] of Object.entries(of)) {
    if (!key.includes("{")) continue;
    const names: string[] = [];
    const source = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        if (name) {
          names.push(name);
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    list.push({ match: new RegExp(`^${source}$`, "s"), names, into });
  }
  // The longer the fixed part, the surer the match.
  list.sort((a, b) => b.match.source.length - a.match.source.length);
  patterns.set(of, list);
  return list;
}

function lookUp(of: Table, text: string): string {
  const exact = of[text];
  if (exact) return exact;
  let cache = answers.get(of);
  if (!cache) {
    cache = new Map();
    answers.set(of, cache);
  }
  const known = cache.get(text);
  if (known !== undefined) return known;
  let out = text;
  for (const p of patternsOf(of)) {
    const hit = p.match.exec(text);
    if (!hit) continue;
    const vars: Vars = {};
    // What was filled in may be a phrase of its own: "{what} is out" with "the eight".
    p.names.forEach((name, i) => (vars[name] = of[hit[i + 1]] ?? hit[i + 1]));
    out = fill(p.into, vars);
    break;
  }
  if (cache.size > 4000) cache.clear();
  cache.set(text, out);
  return out;
}

/**
 * A phrase in the current language. Anything in braces is filled in from
 * vars, so a translation can put the name or the number where its grammar
 * wants it: t("{name} is thinking", { name }). A sentence already put
 * together -- "ana is thinking" -- finds its translation by the same pattern.
 */
export function t(text: string, vars?: Vars): string {
  if (typeof text !== "string") return text;
  let out = table && text ? lookUp(table, text) : text;
  if (vars) out = fill(out, vars);
  return out;
}

async function fetchTable(lang: Lang): Promise<Table> {
  const have = loaded[lang];
  if (have) return have;
  const words = lang === "pt" ? await import("./i18n/pt") : await import("./i18n/es");
  loaded[lang] = words.default;
  return words.default;
}

const emit = () => listeners.forEach((listener) => listener());

export async function setLanguage(lang: Lang): Promise<void> {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    // Remembered for this visit only.
  }
  await fetchTable(lang);
  chosen = lang;
  emit();
}

function stored(): Lang {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "en" || saved === "pt" || saved === "es") return saved;
  } catch {
    // Nothing saved, or nothing we may read.
  }
  const browser = (navigator.language || "en").slice(0, 2).toLowerCase();
  return browser === "pt" || browser === "es" ? browser : "en";
}

// In the browser, the visitor's language is read once and its words fetched;
// until they arrive the page stays in English, as it was drawn on the server.
if (typeof window !== "undefined") {
  const lang = stored();
  if (lang !== "en") {
    void fetchTable(lang).then(() => {
      chosen = lang;
      emit();
    });
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The language to draw with. English while the page is still waking up, so it matches the server's. */
export function useLanguage(): Lang {
  return useSyncExternalStore(
    subscribe,
    () => chosen,
    () => "en",
  );
}

/** A table of words for a language, from wherever it came. */
export function learn(lang: Lang, words: Table): void {
  loaded[lang] = words;
}

/** Points t() at a language's table, just before the interface is drawn in it. */
export function drawIn(lang: Lang): void {
  table = lang === "en" ? null : (loaded[lang] ?? null);
}
