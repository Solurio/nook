import test from "node:test";
import assert from "node:assert/strict";

import { parseMediaLink, trackRef } from "../src/lib/media.ts";
import type { MediaTrack } from "../src/lib/types.ts";

test("youtube links go to the youtube player", () => {
  const r = parseMediaLink("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(r?.provider, "youtube");
  assert.equal(r?.ref, "dQw4w9WgXcQ");
});

test("direct audio files are detected with a title from the filename", () => {
  const mp3 = parseMediaLink("https://example.com/songs/My%20Song.mp3");
  assert.equal(mp3?.provider, "audio");
  assert.equal(mp3?.ref, "https://example.com/songs/My%20Song.mp3");
  assert.equal(mp3?.title, "My Song");

  for (const ext of ["ogg", "wav", "m4a", "aac", "flac", "opus"]) {
    assert.equal(parseMediaLink(`https://cdn.site/a.${ext}`)?.provider, "audio", ext);
  }
});

test("an audio link with a query string still counts", () => {
  assert.equal(parseMediaLink("https://cdn.site/track.mp3?token=abc")?.provider, "audio");
});

test("soundcloud links go to the soundcloud player", () => {
  const r = parseMediaLink("https://soundcloud.com/artist/some-track");
  assert.equal(r?.provider, "soundcloud");
  assert.equal(r?.ref, "https://soundcloud.com/artist/some-track");
});

test("things without a real control API are not synced media", () => {
  // Spotify / a bare site have no free synced-playback API here.
  assert.equal(parseMediaLink("https://open.spotify.com/track/abc"), null);
  assert.equal(parseMediaLink("https://example.com/page"), null);
  assert.equal(parseMediaLink(""), null);
});

test("trackRef prefers ref but falls back to a legacy videoId", () => {
  assert.equal(trackRef({ provider: "audio", ref: "u.mp3" } as MediaTrack), "u.mp3");
  assert.equal(trackRef({ provider: "youtube", videoId: "abc123" } as MediaTrack), "abc123");
});
