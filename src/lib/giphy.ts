"use client";

// Giphy source: gifs and (transparent) stickers. Needs a free API key; calls go
// straight from the browser, which Giphy's CORS allows.

import type { Gif, SourceState } from "./gifs";

const KEY = process.env.NEXT_PUBLIC_GIPHY_KEY;
const ENDPOINT = "https://api.giphy.com/v1";

export function giphyEnabled(): boolean {
  return Boolean(KEY);
}

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyItem {
  id: string;
  title?: string;
  images: {
    fixed_width?: GiphyImage;
    downsized_medium?: GiphyImage;
    original?: GiphyImage;
  };
}

/** One provider call: what came back, and how it went. */
export interface Attempt {
  gifs: Gif[];
  state: SourceState;
}

function toGif(item: GiphyItem, sticker: boolean): Gif | null {
  const preview = item.images.fixed_width;
  const full = item.images.downsized_medium ?? item.images.original;
  if (!preview || !full) return null;
  return {
    id: `giphy:${item.id}`,
    preview: preview.url,
    full: full.url,
    width: Number(full.width) || 200,
    height: Number(full.height) || 200,
    title: item.title ?? "gif",
    sticker,
    source: "giphy",
  };
}

async function run(
  kind: "gifs" | "stickers",
  path: string,
  params: Record<string, string>,
): Promise<Attempt> {
  if (!KEY) return { gifs: [], state: "failed" };

  const query = new URLSearchParams({ api_key: KEY, rating: "pg-13", ...params });
  try {
    const res = await fetch(`${ENDPOINT}/${kind}/${path}?${query.toString()}`);

    // 429 is the plain rate limit; Giphy also answers 403 once a key is over
    // its daily allowance. Neither is worth retrying with a different word.
    if (res.status === 429 || res.status === 403) return { gifs: [], state: "limited" };
    if (!res.ok) return { gifs: [], state: "failed" };

    const body = (await res.json()) as { data?: GiphyItem[] };
    const gifs = (body.data ?? [])
      .map((item) => toGif(item, kind === "stickers"))
      .filter((g): g is Gif => g !== null);
    return { gifs, state: "ok" };
  } catch {
    return { gifs: [], state: "failed" };
  }
}

export function searchGiphy(term: string, limit = 20): Promise<Attempt>[] {
  return [
    run("gifs", "search", { q: term, limit: String(limit), bundle: "messaging_non_clips" }),
    run("stickers", "search", { q: term, limit: String(limit) }),
  ];
}

export function trendingGiphy(limit = 20): Promise<Attempt>[] {
  return [
    run("gifs", "trending", { limit: String(limit) }),
    run("stickers", "trending", { limit: String(limit) }),
  ];
}
