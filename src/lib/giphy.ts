"use client";

// Giphy source: gifs and (transparent) stickers. Needs a free API key; calls go
// straight from the browser, which Giphy's CORS allows.

import type { Gif } from "./gifs";

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

async function run(kind: "gifs" | "stickers", path: string, params: Record<string, string>): Promise<Gif[]> {
  if (!KEY) return [];
  const query = new URLSearchParams({ api_key: KEY, rating: "pg-13", ...params });
  const res = await fetch(`${ENDPOINT}/${kind}/${path}?${query.toString()}`);
  if (!res.ok) throw new Error(`giphy ${res.status}`);
  const body = (await res.json()) as { data: GiphyItem[] };
  return body.data.map((item) => toGif(item, kind === "stickers")).filter((g): g is Gif => g !== null);
}

export function searchGiphy(term: string, limit = 20): Promise<Gif[]>[] {
  return [
    run("gifs", "search", { q: term, limit: String(limit), bundle: "messaging_non_clips" }),
    run("stickers", "search", { q: term, limit: String(limit) }),
  ];
}

export function trendingGiphy(limit = 20): Promise<Gif[]>[] {
  return [
    run("gifs", "trending", { limit: String(limit) }),
    run("stickers", "trending", { limit: String(limit) }),
  ];
}
