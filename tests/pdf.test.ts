import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_MARKS_PER_PAGE,
  MAX_POINTS,
  addMark,
  canTurn,
  clampPage,
  countMatches,
  editNote,
  emptyPdf,
  markAt,
  progress,
  removeMark,
  safeLink,
  simplify,
  snippet,
  spreadOf,
  toggleBookmark,
  turn,
  type PdfData,
} from "../src/lib/pdf.ts";

const doc = (pages: number): PdfData => ({ ...emptyPdf(), src: "x", pages });

test("a book opens with the cover alone on the right", () => {
  assert.deepEqual(spreadOf(1, 10), [null, 1]);
  assert.deepEqual(spreadOf(2, 10), [2, 3]);
  assert.deepEqual(spreadOf(3, 10), [2, 3], "either page of a spread is that spread");
  assert.deepEqual(spreadOf(10, 10), [10, null], "the last page may be alone");
  assert.deepEqual(spreadOf(9, 9), [8, 9]);
});

test("turning a book goes a spread at a time, and stops at the covers", () => {
  assert.equal(turn(1, 10, "book", 1), 2);
  assert.equal(turn(2, 10, "book", 1), 4);
  assert.equal(turn(3, 10, "book", 1), 4);
  assert.equal(turn(4, 10, "book", -1), 2);
  assert.equal(turn(2, 10, "book", -1), 1);
  assert.equal(turn(1, 10, "book", -1), 1);
  assert.equal(turn(10, 10, "book", 1), 10);
  assert.equal(canTurn(1, 10, "book", -1), false);
  assert.equal(canTurn(10, 10, "book", 1), false);
  assert.equal(canTurn(8, 9, "book", 1), false, "8 and 9 are the last spread");
  assert.equal(canTurn(1, 1, "book", 1), false);
});

test("a clipboard goes a sheet at a time", () => {
  assert.equal(turn(1, 3, "clipboard", 1), 2);
  assert.equal(turn(3, 3, "clipboard", 1), 3);
  assert.equal(canTurn(2, 3, "clipboard", -1), true);
});

test("pages stay inside the document", () => {
  assert.equal(clampPage(0, 5), 1);
  assert.equal(clampPage(99, 5), 5);
  assert.equal(clampPage(Number.NaN, 5), 1);
  assert.equal(progress(1, 5), 0);
  assert.equal(progress(5, 5), 1);
});

test("a stroke is thinned to what matters and kept on the page", () => {
  const straight = Array.from({ length: 200 }, (_, i) => [i / 200, 0.5]).flat();
  assert.deepEqual(simplify(straight), [0, 0.5, 0.995, 0.5], "a straight line is two points");
  const wild = Array.from({ length: 2000 }, (_, i) => [((i * 37) % 1000) / 1000, ((i * 91) % 1000) / 1000]).flat();
  assert.ok(simplify(wild).length <= MAX_POINTS + 2);
  assert.deepEqual(simplify([-1, 2]), [0, 1], "clamped to the page");
});

test("marks go on their page, and a page only holds so many", () => {
  let data = doc(3);
  const stroke = (id: string) => ({ id, kind: "pen" as const, color: "#000", width: 3, points: [0.1, 0.1, 0.5, 0.6] });
  data = addMark(data, 2, stroke("a"));
  assert.equal(data.marks["2"].length, 1);
  assert.equal(addMark(data, 2, { ...stroke("dot"), points: [0.1, 0.1] }), data, "a dot is not a stroke");
  for (let i = 0; i < MAX_MARKS_PER_PAGE + 10; i += 1) data = addMark(data, 2, stroke(`s${i}`));
  assert.equal(data.marks["2"].length, MAX_MARKS_PER_PAGE);
  assert.equal(data.marks["2"].at(-1)?.id, `s${MAX_MARKS_PER_PAGE + 9}`, "the oldest go first");
});

test("notes can be written, rewritten, and taken off", () => {
  let data = addMark(doc(3), 1, { id: "n", kind: "note", x: 0.3, y: 0.4, text: "look", color: "#ffe066" });
  data = editNote(data, 1, "n", "look here".repeat(100));
  const note = data.marks["1"][0];
  assert.ok(note.kind === "note" && note.text.length === 280);
  assert.equal(markAt(data.marks["1"], 0.31, 0.41)?.id, "n");
  data = removeMark(data, 1, "n");
  assert.equal(data.marks["1"], undefined);
});

test("bookmarks toggle and stay in order", () => {
  let data = toggleBookmark(doc(20), 9);
  data = toggleBookmark(data, 3);
  assert.deepEqual(data.bookmarks, [3, 9]);
  assert.deepEqual(toggleBookmark(data, 9).bookmarks, [3]);
});

test("search ignores case and accents, and shows where it found it", () => {
  assert.equal(countMatches("Café, CAFE and cafe", "cafe"), 3);
  assert.equal(countMatches("nothing here", "  "), 0);
  assert.equal(snippet("The quick brown fox jumps over the lazy dog", "fox", 6), "...brown fox jumps...");
});

test("only ordinary links are ever opened", () => {
  assert.equal(safeLink("https://example.com/a"), "https://example.com/a");
  assert.equal(safeLink("mailto:someone@example.com"), "mailto:someone@example.com");
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("file:///etc/passwd"), null);
  assert.equal(safeLink("not a url"), null);
});
