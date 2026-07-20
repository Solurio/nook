import test from "node:test";
import assert from "node:assert/strict";

import { resolveLink, withParent } from "../src/lib/embeds.ts";

test("a youtube link becomes the synced media player", () => {
  const r = resolveLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(r?.kind, "media");
  assert.equal(r?.kind === "media" && r.videoId, "dQw4w9WgXcQ");
});

test("a twitch channel becomes its live player embed", () => {
  const r = resolveLink("https://twitch.tv/shroud");
  assert.equal(r?.kind, "embed");
  assert.equal(r?.kind === "embed" && r.url.includes("player.twitch.tv/?channel=shroud"), true);
  assert.equal(r?.kind === "embed" && r.url.includes("parent=__PARENT__"), true);
});

test("a twitch vod and clip use the right embed forms", () => {
  const vod = resolveLink("https://www.twitch.tv/videos/123456789");
  assert.equal(vod?.kind === "embed" && vod.url.includes("player.twitch.tv/?video=123456789"), true);

  const clip = resolveLink("https://clips.twitch.tv/SomeClipSlug");
  assert.equal(clip?.kind === "embed" && clip.url.includes("clips.twitch.tv/embed?clip=SomeClipSlug"), true);
});

test("a vimeo link becomes its player embed", () => {
  const r = resolveLink("https://vimeo.com/76979871");
  assert.equal(r?.kind === "embed" && r.url, "https://player.vimeo.com/video/76979871");
});

test("a direct gif link is dropped in as an image", () => {
  const r = resolveLink("https://media.giphy.com/media/abc/giphy.gif");
  assert.equal(r?.kind, "image");
});

test("an ordinary site is framed as-is", () => {
  const r = resolveLink("https://example.com/page");
  assert.equal(r?.kind, "embed");
  assert.equal(r?.kind === "embed" && r.url, "https://example.com/page");
});

test("junk resolves to nothing", () => {
  assert.equal(resolveLink(""), null);
  assert.equal(resolveLink("   "), null);
});

test("withParent fills in the host for twitch embeds", () => {
  // No window in Node, so it falls back to localhost -- but the placeholder is gone.
  const filled = withParent("https://player.twitch.tv/?channel=x&parent=__PARENT__");
  assert.equal(filled.includes("__PARENT__"), false);
  assert.equal(filled.includes("parent="), true);
});
