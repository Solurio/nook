import type { MediaData, MediaTrack } from "./types";

/**
 * Pulls a YouTube video id out of the shapes people actually paste: watch
 * links, youtu.be shorteners, /embed/, /shorts/, and bare ids.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && ["embed", "shorts", "v", "live"].includes(segments[0])) {
      const id = segments[1];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
  }

  return null;
}

export function youTubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function emptyMedia(): MediaData {
  return {
    queue: [],
    index: 0,
    playing: false,
    positionSec: 0,
    anchoredAt: Date.now(),
    volume: 60,
    audioOnly: false,
  };
}

export function currentTrack(media: MediaData): MediaTrack | null {
  return media.queue[media.index] ?? null;
}

/**
 * Where the playhead should be right now. State stores a position plus the
 * timestamp it was taken, so every client extrapolates to the same place
 * instead of relying on a stream of tick messages.
 */
export function projectedPosition(media: MediaData): number {
  if (!media.playing) return Math.max(0, media.positionSec);
  const elapsed = (Date.now() - media.anchoredAt) / 1000;
  return Math.max(0, media.positionSec + elapsed);
}

/** Rewrites the anchor so the projection stays continuous across an edit. */
export function anchor(media: MediaData, positionSec: number, playing: boolean): MediaData {
  return { ...media, positionSec: Math.max(0, positionSec), playing, anchoredAt: Date.now() };
}

export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, "0")}`
    : `${mm}:${String(s).padStart(2, "0")}`;
}
