"use client";

import {
  explain,
  interleave,
  type Attempt,
  type Gif,
  type GifResults,
  type SourceName,
  type SourceReport,
  type SourceState,
} from "./gifs";
import { giphyEnabled, searchGiphy, trendingGiphy } from "./giphy";
import { klipyEnabled, searchKlipy } from "./klipy";
import { searchTenor, tenorEnabled, trendingTenor } from "./tenor";

export { explain };

export function anyGifSource(): boolean {
  return giphyEnabled() || klipyEnabled() || tenorEnabled();
}

export function enabledSources(): string[] {
  const names: string[] = [];
  if (giphyEnabled()) names.push("giphy");
  if (klipyEnabled()) names.push("klipy");
  if (tenorEnabled()) names.push("tenor");
  return names;
}

/**
 * Searches already made this visit. Free keys are metered per day, and without
 * this every reopened panel and every retyped word spent more of the allowance
 * to show what was already on screen a moment ago.
 */
const cache = new Map<string, GifResults>();
const CACHE_LIMIT = 40;

function remember(key: string, results: GifResults) {
  // A provider that was merely out of requests will have more later, so that
  // answer is not worth keeping.
  if (results.reports.some((r) => r.state !== "ok")) return;
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, results);
}

/** Rolls the two calls a provider makes into one verdict for that provider. */
export function summarise(
  source: SourceName,
  attempts: PromiseSettledResult<Attempt>[],
): SourceReport {
  const done = attempts
    .filter((a): a is PromiseFulfilledResult<Attempt> => a.status === "fulfilled")
    .map((a) => a.value);

  const count = done.reduce((sum, a) => sum + a.gifs.length, 0);

  // Anything that worked speaks for the provider. Failing that, report the most
  // actionable reason: a refused key needs a person, a spent one needs a wait.
  let state: SourceState = "failed";
  if (done.some((a) => a.state === "ok")) state = "ok";
  else if (done.some((a) => a.state === "badkey")) state = "badkey";
  else if (done.some((a) => a.state === "limited")) state = "limited";

  return { source, state, count };
}

/**
 * Asks every configured provider at once and interleaves what comes back. A
 * provider that is out of requests or unreachable is reported rather than
 * silently dropped, because an empty grid otherwise looks like the word was the
 * problem when the quota was.
 */
export async function searchGifs(term: string): Promise<GifResults> {
  const key = term.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const has = key.length > 0;
  const giphy = giphyEnabled() ? (has ? searchGiphy(term) : trendingGiphy()) : [];
  const klipy = klipyEnabled() ? searchKlipy(has ? term : "") : [];
  const tenor = tenorEnabled() ? (has ? searchTenor(term) : trendingTenor()) : [];

  const [giphySettled, klipySettled, tenorSettled] = await Promise.all([
    Promise.allSettled(giphy),
    Promise.allSettled(klipy),
    Promise.allSettled(tenor),
  ]);

  const reports: SourceReport[] = [];
  if (giphyEnabled()) reports.push(summarise("giphy", giphySettled));
  if (klipyEnabled()) reports.push(summarise("klipy", klipySettled));
  if (tenorEnabled()) reports.push(summarise("tenor", tenorSettled));

  const lists: Gif[][] = [...giphySettled, ...klipySettled, ...tenorSettled]
    .filter((s): s is PromiseFulfilledResult<Attempt> => s.status === "fulfilled")
    .map((s) => s.value.gifs);

  const results: GifResults = { gifs: interleave(lists), reports };
  remember(key, results);
  return results;
}
