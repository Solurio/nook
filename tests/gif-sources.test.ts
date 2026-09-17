import test from "node:test";
import assert from "node:assert/strict";

import { explain, interleave, type Gif, type SourceReport } from "../src/lib/gifs.ts";

const gif = (id: string, source: Gif["source"]): Gif => ({
  id,
  preview: "p",
  full: "f",
  width: 100,
  height: 100,
  title: id,
  sticker: false,
  source,
});

test("results from several sources alternate instead of clumping", () => {
  const merged = interleave([
    [gif("a1", "giphy"), gif("a2", "giphy")],
    [gif("b1", "klipy"), gif("b2", "klipy")],
  ]);
  assert.deepEqual(
    merged.map((g) => g.id),
    ["a1", "b1", "a2", "b2"],
  );
});

test("the same gif from two sources is only shown once", () => {
  const merged = interleave([[gif("same", "giphy")], [gif("same", "klipy")]]);
  assert.equal(merged.length, 1);
});

test("a used-up quota is named, because a different word will not help", () => {
  const reports: SourceReport[] = [{ source: "giphy", state: "limited", count: 0 }];
  const note = explain(reports);

  assert.ok(note, "there should be something to say");
  assert.match(note, /giphy/);
  assert.match(note, /out of requests/);
});

test("when one source is out and another carried it, the note says so", () => {
  const note = explain([
    { source: "giphy", state: "limited", count: 0 },
    { source: "klipy", state: "ok", count: 12 },
  ]);
  assert.ok(note);
  assert.match(note, /giphy is out of requests/);
  assert.match(note, /klipy/, "and credits the one that answered");
});

test("a plain empty result says nothing, so the panel can say 'nothing turned up'", () => {
  // Everything answered; the term simply had no gifs. That is not worth a note.
  assert.equal(explain([{ source: "giphy", state: "ok", count: 0 }]), null);
  assert.equal(explain([]), null);
});

test("being unreachable reads differently from being rate limited", () => {
  const broken = explain([{ source: "klipy", state: "failed", count: 0 }]);
  assert.ok(broken);
  assert.match(broken, /could not be reached/);
  assert.doesNotMatch(broken, /out of requests/);
});
