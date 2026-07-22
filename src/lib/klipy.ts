"use client";

// Klipy source: gifs + stickers. Klipy's API sends no CORS headers, so the
// request goes through our own /api/klipy proxy (a Cloudflare Pages Function)
// instead of hitting api.klipy.com directly. Klipy does not publish exact JSON
// field names, so the media URLs are pulled out defensively -- we walk each
// result for any gif/webp with dimensions and pick a small one for the grid and
// a bigger one for the drop.

import type { Gif } from "./gifs";

const KEY = process.env.NEXT_PUBLIC_KLIPY_KEY;

export function klipyEnabled(): boolean {
  return Boolean(KEY);
}

interface Media {
  url: string;
  width: number;
  height: number;
  fmt: "gif" | "webp" | "mp4";
}

function collect(node: unknown, out: Media[], depth = 0): void {
  if (!node || typeof node !== "object" || depth > 6) return;
  const obj = node as Record<string, unknown>;
  const url = obj.url ?? obj.src;
  if (typeof url === "string") {
    const match = url.match(/\.(gif|webp|mp4)(\?|$)/i);
    if (match) {
      out.push({
        url,
        width: Number(obj.width) || 0,
        height: Number(obj.height) || 0,
        fmt: match[1].toLowerCase() as Media["fmt"],
      });
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") collect(value, out, depth + 1);
  }
}

/** Exported for tests: pulls a usable gif/webp out of an item of unknown shape. */
export function parseKlipyItem(item: unknown, sticker: boolean, index: number): Gif | null {
  const media: Media[] = [];
  collect(item, media);
  // <img> can only show gif/webp, not mp4.
  const still = media.filter((m) => m.fmt === "gif" || m.fmt === "webp");
  if (still.length === 0) return null;

  const byWidth = [...still].sort((a, b) => (a.width || 9999) - (b.width || 9999));
  const preview = byWidth.find((m) => (m.width || 0) >= 120) ?? byWidth[0];
  const full = [...still].sort((a, b) => (b.width || 0) - (a.width || 0))[0];

  const record = item as { id?: string | number; slug?: string; title?: string };
  const id = record.id ?? record.slug ?? `k${index}`;
  return {
    id: `klipy:${id}`,
    preview: preview.url,
    full: full.url,
    width: full.width || 200,
    height: full.height || 200,
    title: record.title ?? "gif",
    sticker,
    source: "klipy",
  };
}

async function run(kind: "gifs" | "stickers", term: string, limit: number): Promise<Gif[]> {
  if (!KEY) return [];
  const params = new URLSearchParams({ type: kind, per_page: String(limit) });
  if (term.trim()) params.set("q", term.trim());

  // Same-origin proxy -> no CORS. The function holds the key and calls Klipy.
  const res = await fetch(`/api/klipy?${params.toString()}`);
  if (!res.ok) throw new Error(`klipy ${res.status}`);
  const body = (await res.json()) as { data?: unknown };

  // Klipy wraps results as data.data (paginated) or sometimes just data.
  const inner = body.data as { data?: unknown[] } | unknown[] | undefined;
  const items = Array.isArray(inner) ? inner : Array.isArray(inner?.data) ? inner.data : [];

  return items
    .map((item, i) => parseKlipyItem(item, kind === "stickers", i))
    .filter((g): g is Gif => g !== null);
}

export function searchKlipy(term: string, limit = 20): Promise<Gif[]>[] {
  return [run("gifs", term, limit), run("stickers", term, limit)];
}
