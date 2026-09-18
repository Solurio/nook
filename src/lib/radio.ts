// The room radio: a playlist that lives in the project's own storage rather
// than in this repository, played through the ordinary synced player on
// repeat. Only the names are here; the files are whatever was put under
// music/omori/ in the decorations bucket.

import type { MediaData, MediaTrack } from "./types";
import { emptyMedia } from "./media";

export const RADIO_TITLES = [
  "Title",
  "Good Morning",
  "Trees...",
  "Where We Used to Play",
  "Treehouse - Here We Are, Together Again",
  "Friends.",
  "By Your Side.",
  "My Time",
  "Forest Chillin'",
  "Let's Get Together Now!",
  "Finding Shapes in the Clouds",
  "Clams Clams Clams",
  "Sugar Star Planetarium",
  "A Place by a Lake",
  "Space Road 1979",
  "Stardust Diving",
  "Snow Forest - A Single Flower Blooms",
  "Pyrefly Forest - Cat's Cradle",
  "Underwater Highway",
  "Orchard",
  "White Space",
  "Lost Library",
  "World's End Valentine",
  "Duet",
];

/** The file name a title was stored under. */
export function radioSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function radioUrl(base: string, title: string): string {
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/decorations/music/omori/${radioSlug(title)}.mp3`;
}

/** A player loaded with the whole radio, on repeat, starting wherever it is told. */
export function radioMedia(base: string, addedBy: string, first = 0): MediaData {
  const queue: MediaTrack[] = RADIO_TITLES.map((title, i) => ({
    id: `radio-${i}`,
    provider: "audio",
    ref: radioUrl(base, title),
    title,
    addedBy,
  }));
  return { ...emptyMedia(), queue, index: Math.max(0, Math.min(queue.length - 1, first)), audioOnly: true, repeat: "all" };
}

/** Where a player goes when a track finishes, given how it repeats. */
export function afterEnd(media: MediaData): { index: number; playing: boolean; again: boolean } {
  const repeat = media.repeat ?? "off";
  if (repeat === "one") return { index: media.index, playing: true, again: true };
  const next = media.index + 1;
  if (next < media.queue.length) return { index: next, playing: true, again: false };
  if (repeat === "all") return { index: 0, playing: true, again: media.queue.length === 1 };
  return { index: 0, playing: false, again: false };
}
