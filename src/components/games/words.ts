"use client";

import { promptsFrom, type Language } from "@/lib/bomb";

export interface Dictionary {
  words: Set<string>;
  prompts: string[];
}

const loaded = new Map<Language, Promise<Dictionary>>();

/** A language's five-letter words, fetched once and kept for the visit. */
export function loadWords(language: Language): Promise<Dictionary> {
  let found = loaded.get(language);
  if (!found) {
    found = fetch(`/words/${language}.txt`)
      .then((response) => {
        if (!response.ok) throw new Error(`the ${language} words would not load`);
        return response.text();
      })
      .then((text) => {
        // Split either way: a copy checked out on Windows may have CRLF endings.
        const list = text.split(/\r?\n/).filter(Boolean);
        return { words: new Set(list), prompts: promptsFrom(list) };
      });
    found.catch(() => loaded.delete(language));
    loaded.set(language, found);
  }
  return found;
}
