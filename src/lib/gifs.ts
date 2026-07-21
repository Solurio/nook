"use client";

// One search box, several sources. Giphy (gifs + transparent stickers) and
// Klipy get queried together and their results interleaved, so if one provider
// is thin on a term the others fill in -- the "hello charlotte" case.

export interface Gif {
  id: string;
  /** Small looping preview for the grid. */
  preview: string;
  /** Full-size version dropped onto the canvas. */
  full: string;
  width: number;
  height: number;
  title: string;
  /** Stickers are transparent and drop without a frame. */
  sticker: boolean;
  source: "giphy" | "klipy";
}

/** Round-robin merge so the grid mixes providers instead of clumping. */
export function interleave(lists: Gif[][]): Gif[] {
  const out: Gif[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i += 1) {
    for (const list of lists) {
      const gif = list[i];
      if (gif && !seen.has(gif.id)) {
        seen.add(gif.id);
        out.push(gif);
      }
    }
  }
  return out;
}
