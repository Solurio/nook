import test from "node:test";
import assert from "node:assert/strict";

import { interleave, type Gif } from "../src/lib/gifs.ts";
import { parseKlipyItem } from "../src/lib/klipy.ts";

function gif(id: string): Gif {
  return { id, preview: "p", full: "f", width: 100, height: 100, title: "t", sticker: false, source: "giphy" };
}

test("interleave mixes sources round-robin", () => {
  const a = [gif("a1"), gif("a2"), gif("a3")];
  const b = [gif("b1"), gif("b2")];
  assert.deepEqual(
    interleave([a, b]).map((g) => g.id),
    ["a1", "b1", "a2", "b2", "a3"],
  );
});

test("interleave drops duplicate ids", () => {
  const a = [gif("x"), gif("y")];
  const b = [gif("x"), gif("z")];
  assert.deepEqual(
    interleave([a, b]).map((g) => g.id),
    ["x", "y", "z"],
  );
});

// ---------------------------------------------------------------------------
// Klipy's response shape isn't publicly documented, so the parser digs for any
// gif/webp with dimensions. These cover the shapes it is likely to meet.
// ---------------------------------------------------------------------------

test("parses a nested file/size/format klipy item", () => {
  const item = {
    id: 42,
    title: "cat",
    file: {
      sm: { gif: { url: "https://k/sm.gif", width: 120, height: 90 } },
      hd: { gif: { url: "https://k/hd.gif", width: 480, height: 360 }, mp4: { url: "https://k/hd.mp4", width: 480, height: 360 } },
    },
  };
  const result = parseKlipyItem(item, false, 0);
  assert.ok(result);
  assert.equal(result!.id, "klipy:42");
  assert.equal(result!.preview, "https://k/sm.gif", "small one for the grid");
  assert.equal(result!.full, "https://k/hd.gif", "biggest gif for the drop");
  assert.equal(result!.width, 480);
  assert.equal(result!.sticker, false);
});

test("prefers gif/webp and ignores mp4-only entries", () => {
  const onlyMp4 = { id: 1, file: { hd: { mp4: { url: "https://k/x.mp4", width: 400, height: 300 } } } };
  assert.equal(parseKlipyItem(onlyMp4, false, 0), null, "an <img> cannot show mp4");

  const withWebp = { id: 2, files: { md: { webp: { url: "https://k/x.webp", width: 200, height: 200 } } } };
  const result = parseKlipyItem(withWebp, true, 0);
  assert.ok(result);
  assert.equal(result!.full, "https://k/x.webp");
  assert.equal(result!.sticker, true);
});

test("falls back to an index id when the item has none", () => {
  const item = { file: { sm: { gif: { url: "https://k/a.gif", width: 100, height: 100 } } } };
  const result = parseKlipyItem(item, false, 7);
  assert.equal(result!.id, "klipy:k7");
});
