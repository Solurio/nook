import test from "node:test";
import assert from "node:assert/strict";

import { RADIO_TITLES, afterEnd, radioMedia, radioSlug, radioUrl } from "../src/lib/radio.ts";

test("titles become the file names they were stored under", () => {
  assert.equal(radioSlug("Trees..."), "trees");
  assert.equal(radioSlug("Let's Get Together Now!"), "let-s-get-together-now");
  assert.equal(radioSlug("Treehouse - Here We Are, Together Again"), "treehouse-here-we-are-together-again");
  assert.equal(radioUrl("https://x.supabase.co/", "Duet"), "https://x.supabase.co/storage/v1/object/public/decorations/music/omori/duet.mp3");
  assert.equal(new Set(RADIO_TITLES.map(radioSlug)).size, RADIO_TITLES.length, "two titles share a file");
});

test("the radio is the whole playlist, audio only, going round", () => {
  const media = radioMedia("https://x", "ana");
  assert.equal(media.queue.length, RADIO_TITLES.length);
  assert.equal(media.repeat, "all");
  assert.equal(media.audioOnly, true);
  assert.ok(media.queue.every((t) => t.provider === "audio" && t.ref?.endsWith(".mp3")));
});

test("what happens when a track ends", () => {
  const media = radioMedia("https://x", "ana");
  assert.deepEqual(afterEnd({ ...media, index: 3 }), { index: 4, playing: true, again: false });
  assert.deepEqual(afterEnd({ ...media, index: media.queue.length - 1 }), { index: 0, playing: true, again: false }, "round again");
  assert.deepEqual(afterEnd({ ...media, index: 5, repeat: "one" }), { index: 5, playing: true, again: true });
  assert.deepEqual(afterEnd({ ...media, index: media.queue.length - 1, repeat: "off" }), { index: 0, playing: false, again: false });
  assert.deepEqual(afterEnd({ ...media, queue: media.queue.slice(0, 1), index: 0 }), { index: 0, playing: true, again: true }, "one track on repeat plays again");
});
