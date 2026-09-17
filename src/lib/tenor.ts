"use client";

// Tenor (Google) source: gifs and stickers. The free allowance is far larger
// than Giphy's, which makes it the one worth having when a search still has to
// work late in the day. CORS is open, so it is called straight from the browser.

import type { Attempt, Gif } from "./gifs";

const KEY = process.env.NEXT_PUBLIC_TENOR_KEY;
const ENDPOINT = "https://tenor.googleapis.com/v2";
/** Tenor asks callers to identify themselves so quota is tracked per app. */
const CLIENT = "nook";

export function tenorEnabled(): boolean {
  return Boolean(KEY);
}

interface TenorFormat {
  url: string;
  dims?: [number, number];
}

interface TenorItem {
  id: string;
  content_description?: string;
  media_formats?: Record<string, TenorFormat | undefined>;
}

function toGif(item: TenorItem, sticker: boolean): Gif | null {
  const formats = item.media_formats ?? {};
  // Transparent stickers only exist in the webp and gif variants.
  const preview = formats.tinygif ?? formats.nanogif ?? formats.tinygifpreview;
  const full = formats.gif ?? formats.mediumgif ?? formats.tinygif;
  if (!preview?.url || !full?.url) return null;

  return {
    id: `tenor:${item.id}`,
    preview: preview.url,
    full: full.url,
    width: full.dims?.[0] ?? 200,
    height: full.dims?.[1] ?? 200,
    title: item.content_description ?? "gif",
    sticker,
    source: "tenor",
  };
}

async function run(path: string, params: Record<string, string>, sticker: boolean): Promise<Attempt> {
  if (!KEY) return { gifs: [], state: "failed" };

  const query = new URLSearchParams({
    key: KEY,
    client_key: CLIENT,
    contentfilter: "medium",
    ...params,
  });
  if (sticker) query.set("searchfilter", "sticker");

  try {
    const res = await fetch(`${ENDPOINT}/${path}?${query.toString()}`);

    if (res.status === 429) return { gifs: [], state: "limited" };
    // Google answers 400 or 403 for a key it will not take.
    if (res.status === 403 || res.status === 400) {
      const text = await res.text().catch(() => "");
      const refused = /api key|credential|permission|invalid/i.test(text);
      return { gifs: [], state: refused ? "badkey" : "failed" };
    }
    if (!res.ok) return { gifs: [], state: "failed" };

    const body = (await res.json()) as { results?: TenorItem[] };
    const gifs = (body.results ?? [])
      .map((item) => toGif(item, sticker))
      .filter((g): g is Gif => g !== null);
    return { gifs, state: "ok" };
  } catch {
    return { gifs: [], state: "failed" };
  }
}

export function searchTenor(term: string, limit = 20): Promise<Attempt>[] {
  return [
    run("search", { q: term, limit: String(limit) }, false),
    run("search", { q: term, limit: String(limit) }, true),
  ];
}

export function trendingTenor(limit = 20): Promise<Attempt>[] {
  return [run("featured", { limit: String(limit) }, false)];
}
