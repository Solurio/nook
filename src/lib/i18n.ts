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

export type Vars = Record<string, string | number | null | undefined>;

const fill = (text: string, vars: Vars) => text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name] ?? "") : whole));

/**
 * Phrases that have something filled in -- "{name} is thinking" -- worked out
 * once per table as patterns, so a sentence put together elsewhere with a name
 * or a number in it still finds its translation.
 */
interface Pattern {
  match: RegExp;
  names: string[];
  into: string;
  /** The pattern has words of its own, not just blanks and punctuation. */
  worded: boolean;
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
    list.push({ match: new RegExp(`^${source}$`, "s"), names, into, worded: /[A-Za-z]{2}/.test(key.replace(/\{\w+\}/g, "")) });
  }
  // The longer the fixed part, the surer the match.
  list.sort((a, b) => b.match.source.length - a.match.source.length);
  patterns.set(of, list);
  return list;
}

/**
 * A phrase's translation: said as it is, or matched by the shape of one
 * with blanks, the blanks' own words translated in turn -- "{who}: {action}"
 * with "coup (7)" in it. Only worded shapes are tried inside a blank, so a
 * name is never taken apart.
 */
function translate(of: Table, text: string, depth: number): string {
  const exact = of[text];
  if (exact) return exact;
  for (const p of patternsOf(of)) {
    if (depth > 0 && !p.worded) continue;
    const hit = p.match.exec(text);
    if (!hit) continue;
    const vars: Vars = {};
    p.names.forEach((name, i) => (vars[name] = depth < 3 ? translate(of, hit[i + 1], depth + 1) : (of[hit[i + 1]] ?? hit[i + 1])));
    return fill(p.into, vars);
  }
  return text;
}

function lookUp(of: Table, text: string): string {
  let cache = answers.get(of);
  if (!cache) {
    cache = new Map();
    answers.set(of, cache);
  }
  const known = cache.get(text);
  if (known !== undefined) return known;
  let out = translate(of, text, 0);
  // " (inverted)" is the phrase "(inverted)" with a space to go after something.
  if (out === text) {
    const edges = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (edges && (edges[1] || edges[3]) && edges[2]) {
      const inner = translate(of, edges[2], 0);
      if (inner !== edges[2]) out = edges[1] + inner + edges[3];
    }
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
  if (missing && table && out === text && /[A-Za-z]{2}/.test(text)) missing.set(text, (missing.get(text) ?? 0) + 1);
  if (vars) out = fill(out, vars);
  return out;
}

/**
 * While developing, every phrase asked for in another language that had no
 * translation, as window.__nookMissing, for finding the gaps.
 */
const missing: Map<string, number> | null =
  process.env.NODE_ENV !== "production" && typeof window !== "undefined"
    ? ((window as unknown as { __nookMissing?: Map<string, number> }).__nookMissing ??= new Map())
    : null;
// And the table in use, to check what is on screen against it.
if (missing) (window as unknown as { __nookTable?: () => Table | null }).__nookTable = () => table;

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
