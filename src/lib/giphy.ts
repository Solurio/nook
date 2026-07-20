"use client";

// GIF search for the sticker picker. Giphy needs a (free) API key; without one
// the panel stays usable but explains how to switch it on. Calls go straight
// from the browser -- Giphy allows CORS -- so nothing server-side is needed.

export interface Gif {
  id: string;
  /** Small looping preview for the grid. */
  preview: string;
  /** Full-size version dropped onto the canvas. */
  full: string;
  width: number;
  height: number;
  title: string;
}

const KEY = process.env.NEXT_PUBLIC_GIPHY_KEY;
const ENDPOINT = "https://api.giphy.com/v1/gifs";

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

function toGif(item: GiphyItem): Gif | null {
  const preview = item.images.fixed_width;
  const full = item.images.downsized_medium ?? item.images.original;
  if (!preview || !full) return null;
  return {
    id: item.id,
    preview: preview.url,
    full: full.url,
    width: Number(full.width) || 200,
    height: Number(full.height) || 200,
    title: item.title ?? "gif",
  };
}

async function run(path: string, params: Record<string, string>): Promise<Gif[]> {
  if (!KEY) return [];
  const query = new URLSearchParams({ api_key: KEY, rating: "pg-13", ...params });
  const res = await fetch(`${ENDPOINT}/${path}?${query.toString()}`);
  if (!res.ok) throw new Error(`giphy ${res.status}`);
  const body = (await res.json()) as { data: GiphyItem[] };
  return body.data.map(toGif).filter((g): g is Gif => g !== null);
}

export function searchGifs(term: string, limit = 24): Promise<Gif[]> {
  return run("search", { q: term, limit: String(limit), bundle: "messaging_non_clips" });
}

export function trendingGifs(limit = 24): Promise<Gif[]> {
  return run("trending", { limit: String(limit) });
}
