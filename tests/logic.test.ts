import test from "node:test";
import assert from "node:assert/strict";

import { parseYouTubeId, projectedPosition, anchor, formatClock, emptyMedia } from "../src/lib/media.ts";
import { normalizeSlugInput, generateSlug } from "../src/lib/slug.ts";
import {
  evaluateTicTacToe,
  evaluateConnectFour,
  dropDisc,
  C4_COLUMNS,
  C4_ROWS,
} from "../src/lib/games.ts";
import { clampSize, topZ } from "../src/lib/items.ts";
import type { AnyItem } from "../src/lib/types.ts";

// ---------------------------------------------------------------------------
// YouTube link parsing
// ---------------------------------------------------------------------------

test("parses every youtube link shape people actually paste", () => {
  const id = "dQw4w9WgXcQ";
  const shapes = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?t=90`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `youtube.com/watch?v=${id}`,
    id,
  ];

  for (const shape of shapes) {
    assert.equal(parseYouTubeId(shape), id, `failed on ${shape}`);
  }
});

test("rejects things that are not youtube videos", () => {
  for (const bad of ["", "   ", "hello there", "https://vimeo.com/12345", "https://youtube.com/"]) {
    assert.equal(parseYouTubeId(bad), null, `should reject ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

test("accepts a bare slug or a full room url", () => {
  assert.equal(normalizeSlugInput("cocoa-willow-7fk2"), "cocoa-willow-7fk2");
  assert.equal(normalizeSlugInput("https://nook.app/r/cocoa-willow-7fk2"), "cocoa-willow-7fk2");
  assert.equal(normalizeSlugInput("https://nook.app/r/cocoa-willow-7fk2/"), "cocoa-willow-7fk2");
  assert.equal(normalizeSlugInput("https://nook.app/r/cocoa-willow-7fk2?x=1"), "cocoa-willow-7fk2");
  assert.equal(normalizeSlugInput("  COCOA-Willow-7fk2  "), "cocoa-willow-7fk2");
});

test("rejects junk slugs", () => {
  for (const bad of ["", "ab", "has spaces", "no_underscores!"]) {
    assert.equal(normalizeSlugInput(bad), null, `should reject "${bad}"`);
  }
});

test("generated slugs are well formed and do not repeat a word", () => {
  for (let i = 0; i < 200; i += 1) {
    const slug = generateSlug();
    assert.match(slug, /^[a-z]+-[a-z]+-[a-z0-9]{4}$/, `bad slug ${slug}`);
    const [a, b] = slug.split("-");
    assert.notEqual(a, b, `slug repeated a word: ${slug}`);
    assert.equal(normalizeSlugInput(slug), slug);
  }
});

// ---------------------------------------------------------------------------
// Tic tac toe
// ---------------------------------------------------------------------------

test("finds wins on rows, columns and both diagonals", () => {
  const cases: Array<[(string | null)[], string]> = [
    [["x", "x", "x", null, null, null, null, null, null], "x"],
    [[null, null, null, "o", "o", "o", null, null, null], "o"],
    [["x", null, null, "x", null, null, "x", null, null], "x"],
    [["o", null, null, null, "o", null, null, null, "o"], "o"],
    [[null, null, "x", null, "x", null, "x", null, null], "x"],
  ];

  for (const [board, winner] of cases) {
    const result = evaluateTicTacToe(board);
    assert.equal(result.winner, winner);
    assert.equal(result.line?.length, 3);
    assert.equal(result.draw, false);
  }
});

test("calls a full board with no line a draw", () => {
  const board = ["x", "o", "x", "x", "o", "o", "o", "x", "x"];
  const result = evaluateTicTacToe(board);
  assert.equal(result.winner, null);
  assert.equal(result.draw, true);
});

test("an unfinished board is neither won nor drawn", () => {
  const result = evaluateTicTacToe(["x", "o", null, null, null, null, null, null, null]);
  assert.equal(result.winner, null);
  assert.equal(result.draw, false);
});

// ---------------------------------------------------------------------------
// Connect four
// ---------------------------------------------------------------------------

function emptyBoard(): (string | null)[][] {
  return Array.from({ length: C4_COLUMNS }, () => [] as (string | null)[]);
}

test("dropping a disc stacks it and leaves the original board alone", () => {
  const board = emptyBoard();
  const next = dropDisc(board, 3, "r");
  assert.ok(next);
  assert.deepEqual(next![3], ["r"]);
  assert.deepEqual(board[3], [], "the input board must not be mutated");

  const stacked = dropDisc(next!, 3, "y");
  assert.deepEqual(stacked![3], ["r", "y"]);
});

test("refuses to overfill a column or use one that does not exist", () => {
  let board = emptyBoard();
  for (let i = 0; i < C4_ROWS; i += 1) {
    const next = dropDisc(board, 0, i % 2 === 0 ? "r" : "y");
    assert.ok(next, `drop ${i} should fit`);
    board = next!;
  }
  assert.equal(board[0].length, C4_ROWS);
  assert.equal(dropDisc(board, 0, "r"), null, "column is full");
  assert.equal(dropDisc(board, -1, "r"), null);
  assert.equal(dropDisc(board, C4_COLUMNS, "r"), null);
});

test("detects a vertical four", () => {
  let board = emptyBoard();
  for (let i = 0; i < 4; i += 1) board = dropDisc(board, 2, "r")!;
  const result = evaluateConnectFour(board);
  assert.equal(result.winner, "r");
  assert.equal(result.cells?.length, 4);
});

test("detects a horizontal four", () => {
  let board = emptyBoard();
  for (let col = 1; col <= 4; col += 1) board = dropDisc(board, col, "y")!;
  assert.equal(evaluateConnectFour(board).winner, "y");
});

test("detects a rising diagonal four", () => {
  // Build a staircase so column n holds n filler discs under the winning line.
  let board = emptyBoard();
  const filler = "y";
  for (let col = 1; col < 4; col += 1) {
    for (let i = 0; i < col; i += 1) board = dropDisc(board, col, filler)!;
  }
  for (let col = 0; col < 4; col += 1) board = dropDisc(board, col, "r")!;

  const result = evaluateConnectFour(board);
  assert.equal(result.winner, "r");
});

test("three in a row is not a win", () => {
  let board = emptyBoard();
  for (let col = 0; col < 3; col += 1) board = dropDisc(board, col, "r")!;
  const result = evaluateConnectFour(board);
  assert.equal(result.winner, null);
  assert.equal(result.draw, false);
});

// ---------------------------------------------------------------------------
// Media playback projection
// ---------------------------------------------------------------------------

test("a paused playhead does not move", () => {
  const media = { ...emptyMedia(), playing: false, positionSec: 30, anchoredAt: Date.now() - 5000 };
  assert.equal(projectedPosition(media), 30);
});

test("a playing playhead advances with wall clock time", () => {
  const media = { ...emptyMedia(), playing: true, positionSec: 10, anchoredAt: Date.now() - 3000 };
  const projected = projectedPosition(media);
  assert.ok(projected >= 12.9 && projected <= 13.2, `expected about 13, got ${projected}`);
});

test("re-anchoring keeps the projection continuous", () => {
  const media = { ...emptyMedia(), playing: true, positionSec: 0, anchoredAt: Date.now() - 8000 };
  const before = projectedPosition(media);
  const paused = anchor(media, before, false);

  assert.equal(paused.playing, false);
  assert.ok(Math.abs(projectedPosition(paused) - before) < 0.05);
});

test("the playhead never goes negative", () => {
  const media = { ...emptyMedia(), playing: false, positionSec: -12 };
  assert.equal(projectedPosition(media), 0);
});

test("formats a clock the way a player does", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(9), "0:09");
  assert.equal(formatClock(72), "1:12");
  assert.equal(formatClock(600), "10:00");
  assert.equal(formatClock(3661), "1:01:01");
  assert.equal(formatClock(Number.NaN), "0:00");
  assert.equal(formatClock(-5), "0:00");
});

// ---------------------------------------------------------------------------
// Item geometry
// ---------------------------------------------------------------------------

test("resizing cannot collapse an item below its minimum", () => {
  const tiny = clampSize("note", 5, 5);
  assert.ok(tiny.width >= 120 && tiny.height >= 120);

  const roomy = clampSize("note", 400, 300);
  assert.deepEqual(roomy, { width: 400, height: 300 });
});

test("new items land above everything already placed", () => {
  const items = [{ z: 3 }, { z: 11 }, { z: 7 }] as AnyItem[];
  assert.equal(topZ(items), 12);
  assert.equal(topZ([]), 1);
});
