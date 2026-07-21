"use client";

import { interleave, type Gif } from "./gifs";
import { giphyEnabled, searchGiphy, trendingGiphy } from "./giphy";
import { klipyEnabled, searchKlipy } from "./klipy";

export function anyGifSource(): boolean {
  return giphyEnabled() || klipyEnabled();
}

export function enabledSources(): string[] {
  const names: string[] = [];
  if (giphyEnabled()) names.push("giphy");
  if (klipyEnabled()) names.push("klipy");
  return names;
}

/**
 * Search every configured provider at once (gifs and stickers) and interleave
 * the results. A provider that errors or has no key is quietly skipped, so a
 * thin term on one source is backfilled by the others.
 */
export async function searchGifs(term: string): Promise<Gif[]> {
  const has = term.trim().length > 0;
  const requests: Promise<Gif[]>[] = has
    ? [...searchGiphy(term), ...searchKlipy(term)]
    : [...trendingGiphy(), ...searchKlipy("")];

  const settled = await Promise.allSettled(requests);
  const lists = settled
    .filter((s): s is PromiseFulfilledResult<Gif[]> => s.status === "fulfilled")
    .map((s) => s.value);

  return interleave(lists);
}
