import { parseYouTubeId } from "./media";

/**
 * What a pasted link should become. Most sites refuse to be framed at all
 * (X-Frame-Options), but the big media providers offer dedicated embed URLs --
 * so we translate their normal links into the form that actually renders.
 */
export type Resolved =
  | { kind: "media"; videoId: string; title: string }
  | { kind: "embed"; url: string; title: string }
  | { kind: "image"; url: string };

/** Twitch needs the parent hostname baked into the embed; this stands in for it. */
const PARENT = "__PARENT__";

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

export function resolveLink(raw: string): Resolved | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // YouTube stays as our own synced player rather than a plain iframe.
  const yt = parseYouTubeId(trimmed);
  if (yt) return { kind: "media", videoId: yt, title: "youtube" };

  const url = safeUrl(trimmed);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  // Direct image / gif link.
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(trimmed)) {
    return { kind: "image", url: trimmed };
  }

  // Twitch: channels (live), VODs and clips.
  if (host === "twitch.tv" || host === "m.twitch.tv") {
    if (segments[0] === "videos" && segments[1]) {
      return embed(`https://player.twitch.tv/?video=${segments[1]}&parent=${PARENT}`, "twitch vod");
    }
    if (segments[1] === "clip" && segments[2]) {
      return embed(`https://clips.twitch.tv/embed?clip=${segments[2]}&parent=${PARENT}`, "twitch clip");
    }
    if (segments[0]) {
      return embed(`https://player.twitch.tv/?channel=${segments[0]}&parent=${PARENT}`, `twitch/${segments[0]}`);
    }
  }
  if (host === "clips.twitch.tv" && segments[0]) {
    return embed(`https://clips.twitch.tv/embed?clip=${segments[0]}&parent=${PARENT}`, "twitch clip");
  }

  // Vimeo.
  if (host === "vimeo.com" && /^\d+$/.test(segments[0] ?? "")) {
    return embed(`https://player.vimeo.com/video/${segments[0]}`, "vimeo");
  }

  // SoundCloud has a visual player widget.
  if (host === "soundcloud.com") {
    return embed(
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(trimmed)}&visual=true`,
      "soundcloud",
    );
  }

  // Spotify embeds swap /track/ for /embed/track/ and so on.
  if (host === "open.spotify.com" && segments.length >= 2) {
    return embed(`https://open.spotify.com/embed/${segments[0]}/${segments[1]}`, "spotify");
  }

  // Anything else: try to frame it as-is. Plenty of sites will refuse, which is
  // why the frame always keeps an "open in a new tab" button.
  return embed(trimmed, host);
}

function embed(url: string, title: string): Resolved {
  return { kind: "embed", url, title };
}

/** Fills in the real page host for providers (Twitch) that demand it. */
export function withParent(url: string): string {
  if (!url.includes(PARENT)) return url;
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return url.replaceAll(PARENT, host);
}
