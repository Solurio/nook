import test from "node:test";
import assert from "node:assert/strict";

import {
  explain,
  interleave,
  type Attempt,
  type Gif,
  type SourceReport,
  type SourceState,
} from "../src/lib/gifs.ts";
import { summarise } from "../src/lib/gif-search.ts";

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

test("a refused key is never mistaken for a spent one", () => {
  // Giphy answers 403 for both, so this is the distinction that matters: one
  // comes back on its own and the other never will.
  const note = explain([{ source: "giphy", state: "badkey", count: 0 }]);
  assert.ok(note);
  assert.match(note, /turned the key down/);
  assert.match(note, /not more waiting/, "says plainly that waiting is the wrong move");
  assert.doesNotMatch(note, /out of requests/);
});

test("a refused key is reported ahead of anything else", () => {
  const note = explain([
    { source: "giphy", state: "limited", count: 0 },
    { source: "klipy", state: "badkey", count: 0 },
  ]);
  assert.ok(note);
  assert.match(note, /klipy turned the key down/, "the fixable one leads");
});

test("being unreachable reads differently from being rate limited", () => {
  const broken = explain([{ source: "klipy", state: "failed", count: 0 }]);
  assert.ok(broken);
  assert.match(broken, /could not be reached/);
  assert.doesNotMatch(broken, /out of requests/);
});

test("a provider's two calls are rolled into one honest verdict", () => {
  const ok = (state: SourceState): PromiseSettledResult<Attempt> => ({
    status: "fulfilled",
    value: { gifs: [], state },
  });

  // Anything that worked speaks for the provider.
  assert.equal(summarise("giphy", [ok("ok"), ok("limited")]).state, "ok");

  // A refused key outranks a spent one: it is the one needing a person.
  assert.equal(summarise("giphy", [ok("badkey"), ok("limited")]).state, "badkey");

  // This is the case that read as "could not be reached" until it was fixed.
  assert.equal(summarise("giphy", [ok("badkey"), ok("badkey")]).state, "badkey");

  assert.equal(summarise("klipy", [ok("limited"), ok("failed")]).state, "limited");
  assert.equal(summarise("klipy", [ok("failed"), ok("failed")]).state, "failed");
});
