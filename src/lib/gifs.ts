"use client";

// One search box, several sources. Each provider is asked for gifs and stickers
// at once and the results are interleaved, so a term that is thin on one source
// gets filled in by the others.

export type SourceName = "giphy" | "klipy" | "tenor";

/** One provider call: what came back, and how it went. */
export interface Attempt {
  gifs: Gif[];
  state: SourceState;
}

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
  source: SourceName;
}

/**
 * How a provider got on. Worth keeping apart, because a used-up quota and a
 * term nobody has a gif for look identical once the results are empty, and
 * only one of them is worth waiting out.
 */
export type SourceState =
  /** Answered, whether or not it had anything. */
  | "ok"
  /** Refused because the key is out of requests for now. Waiting fixes it. */
  | "limited"
  /** Refused the key itself. Waiting will not fix it; the key has to change. */
  | "badkey"
  /** Broke in some other way. */
  | "failed";

export interface SourceReport {
  source: SourceName;
  state: SourceState;
  count: number;
}

export interface GifResults {
  gifs: Gif[];
  reports: SourceReport[];
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

/**
 * What to tell someone when the grid comes back empty, or short. Being out of
 * requests is the one worth naming, since trying a different word will not help
 * and waiting will.
 */
export function explain(reports: SourceReport[]): string | null {
  if (reports.length === 0) return null;

  const limited = reports.filter((r) => r.state === "limited");
  const badkey = reports.filter((r) => r.state === "badkey");
  const failed = reports.filter((r) => r.state === "failed");
  const working = reports.filter((r) => r.state === "ok");

  // A refused key is worth saying first: it is the one that never comes back
  // on its own, so waiting it out is exactly the wrong thing to do.
  if (badkey.length > 0) {
    const names = badkey.map((r) => r.source).join(" and ");
    return `${names} turned the key down. it needs a new one in the environment variables, not more waiting.`;
  }

  if (limited.length > 0 && working.length === 0) {
    const names = limited.map((r) => r.source).join(" and ");
    return `${names} is out of requests for now. it comes back on its own; a second key from another provider covers the gap.`;
  }
  if (limited.length > 0) {
    return `${limited.map((r) => r.source).join(" and ")} is out of requests, so these are from ${working
      .map((r) => r.source)
      .join(" and ")}.`;
  }
  if (failed.length > 0 && working.length === 0) {
    return `${failed.map((r) => r.source).join(" and ")} could not be reached.`;
  }
  return null;
}
