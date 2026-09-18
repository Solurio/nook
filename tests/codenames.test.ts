import test from "node:test";
import assert from "node:assert/strict";

import {
  newSetup,
  outcome,
  remaining,
  guessResult,
  PACKS,
  GRID,
  type Slot,
  type Team,
} from "../src/lib/codenames.ts";

test("both word packs are big enough to keep games fresh", () => {
  for (const [name, words] of Object.entries(PACKS)) {
    assert.ok(words.length >= GRID * 3, `${name} pack is thin: ${words.length}`);
    assert.equal(new Set(words).size, words.length, `${name} pack repeats a word`);
  }
});

test("a setup deals twenty five words with the right key behind them", () => {
  const setup = newSetup("en");

  assert.equal(setup.words.length, GRID);
  assert.equal(new Set(setup.words).size, GRID, "no word appears twice on the table");
  assert.equal(setup.key.length, GRID);

  const count = (slot: Slot) => setup.key.filter((s) => s === slot).length;
  const second: Team = setup.first === "red" ? "blue" : "red";

  assert.equal(count(setup.first), 9, "the side that starts gets the extra card");
  assert.equal(count(second), 8);
  assert.equal(count("neutral"), 7);
  assert.equal(count("assassin"), 1);
});

test("the key is not laid out the same way every time", () => {
  const shapes = new Set<string>();
  for (let i = 0; i < 20; i += 1) shapes.add(newSetup("pt").key.join(""));
  assert.ok(shapes.size > 1, "the key never moved");
});

test("the portuguese pack is used when asked for", () => {
  const setup = newSetup("pt");
  for (const word of setup.words) {
    assert.ok(PACKS.pt.includes(word), `${word} is not from the portuguese pack`);
  }
});

test("turning your own word over lets you keep going", () => {
  assert.equal(guessResult("red", "red"), "continue");
  assert.equal(guessResult("blue", "red"), "handover", "the other team's word ends your turn");
  assert.equal(guessResult("neutral", "red"), "handover");
  assert.equal(guessResult("assassin", "red"), "lost");
});

test("clearing your words wins it", () => {
  const key: Slot[] = ["red", "red", "blue", "neutral", "assassin"];
  const revealed = [true, true, false, false, false];

  assert.equal(remaining(key, revealed, "red"), 0);
  assert.equal(remaining(key, revealed, "blue"), 1);
  assert.deepEqual(outcome(key, revealed, "red"), {
    kind: "won",
    winner: "red",
    reason: "cleared",
  });
});

test("the assassin hands it straight to the other side", () => {
  const key: Slot[] = ["red", "red", "blue", "neutral", "assassin"];
  const revealed = [false, false, false, false, true];

  assert.deepEqual(outcome(key, revealed, "red"), {
    kind: "won",
    winner: "blue",
    reason: "assassin",
  });
  assert.deepEqual(outcome(key, revealed, "blue"), {
    kind: "won",
    winner: "red",
    reason: "assassin",
  });
});

test("a fresh board is still in play", () => {
  const setup = newSetup("en");
  const revealed = Array(GRID).fill(false);
  assert.deepEqual(outcome(setup.key, revealed, setup.first), { kind: "playing" });
});

// ---------------------------------------------------------------------------
// A key nobody but the spymasters can read
// ---------------------------------------------------------------------------

import { before } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import { KEY, keyCards, keySlot, leftFor, standing, turnedFrom, wordSlot } from "../src/lib/codenames.ts";

test("a key has nine for the side going first, eight for the other, seven neutral, one assassin", () => {
  const cards = keyCards("blue");
  assert.equal(cards.length, 25);
  assert.equal(cards.filter((c) => c === "blue").length, 9);
  assert.equal(cards.filter((c) => c === "red").length, 8);
  assert.equal(cards.filter((c) => c === "assassin").length, 1);
});

test("the score is read from the words turned over", () => {
  const turned = turnedFrom({ [wordSlot(0)]: ["red"], [wordSlot(4)]: ["blue"], [wordSlot(7)]: ["red"], other: ["x"] });
  assert.deepEqual(turned, { 0: "red", 4: "blue", 7: "red" });
  assert.equal(leftFor("red", "red", turned), 7);
  assert.equal(leftFor("blue", "red", turned), 7);
});

test("the assassin loses it for whoever found it; clearing your words wins it", () => {
  assert.deepEqual(standing({}, "red", "blue"), { kind: "won", winner: "red", reason: "assassin" });
  const eight: Record<number, "blue"> = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, "blue"]));
  assert.deepEqual(standing(eight, "red", null), { kind: "won", winner: "blue", reason: "cleared" });
  assert.deepEqual(standing({}, "red", null), { kind: "playing" });
});

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("only the spymasters read the key, and a guess turns over one word for everyone", async () => {
  const [dealer, red, blue, guesser] = [await newUser(db), await newUser(db), await newUser(db), await newUser(db)];
  const { itemId } = await tableFor(db, dealer, "codenames");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const read = async (user: string) => {
    const { rows } = await run(user, "select slot, cards from public.secrets where item_id = $1", [itemId]);
    return Object.fromEntries((rows as Array<{ slot: string; cards: string[] }>).map((r) => [r.slot, r.cards]));
  };

  await run(dealer, "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([
      {
        slot: KEY,
        cards: keyCards("red"),
        shuffle: true,
        copies: [
          { slot: keySlot("redMaster"), owner: red },
          { slot: keySlot("blueMaster"), owner: blue },
        ],
      },
    ]),
  ]);

  assert.deepEqual(await read(dealer), {}, "whoever dealt cannot read the key");
  assert.deepEqual(await read(guesser), {});
  const redKey = (await read(red))[keySlot("redMaster")];
  assert.deepEqual((await read(blue))[keySlot("blueMaster")], redKey, "both spymasters see the same key");

  await run(guesser, "select public.pile_reveal(p_item => $1, p_slots => $2, p_at => $3, p_keep => true, p_as => $4)", [
    itemId,
    [KEY],
    12,
    wordSlot(12),
  ]);
  const { rows } = await db.query<{ data: { state: { revealed: Record<string, string[]> } } }>(
    "select data from public.items where id = $1",
    [itemId],
  );
  const revealed = rows[0].data.state.revealed;
  assert.deepEqual(Object.keys(revealed), [wordSlot(12)], "one word turned over, nothing else");
  assert.equal(revealed[wordSlot(12)][0], redKey[12]);
});
