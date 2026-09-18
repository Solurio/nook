// The pile functions, run against a real Postgres with row level security on.
// The question every test here asks one way or another: does anyone learn a
// card they should not?

import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";

let db: PGlite;
let alice: string;
let bob: string;
let carol: string;

before(async () => {
  db = await freshDatabase();
  alice = await newUser(db);
  bob = await newUser(db);
  carol = await newUser(db);
});

const DOMINOES = Array.from({ length: 28 }, (_, i) => i);

type Row = { slot: string; cards: unknown[] };

async function read(user: string, itemId: string): Promise<Record<string, unknown[]>> {
  const { rows } = await as(db, user, (tx) =>
    tx.query<Row>("select slot, cards from public.secrets where item_id = $1", [itemId]),
  );
  return Object.fromEntries(rows.map((row) => [row.slot, row.cards]));
}

async function publicState(itemId: string) {
  const { rows } = await db.query<{ data: { state: Record<string, unknown> } }>(
    "select data from public.items where id = $1",
    [itemId],
  );
  return rows[0].data.state as {
    piles?: Record<string, { owner: string | null; size: number }>;
    revealed?: Record<string, unknown[]>;
    peeked?: Array<{ slot: string; by: string }>;
    [key: string]: unknown;
  };
}

function call(user: string, fn: string, args: Record<string, unknown>) {
  const names = Object.keys(args);
  const params = names.map((name) => {
    const value = args[name];
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? JSON.stringify(value)
      : Array.isArray(value) && name !== "p_slots"
        ? JSON.stringify(value)
        : value;
  });
  const placeholders = names.map((name, i) => `${name} => $${i + 1}`).join(", ");
  return as(db, user, (tx) => tx.query(`select public.${fn}(${placeholders}) as out`, params));
}

/** A dealt domino table: a boneyard nobody owns and a hand for each player. */
async function dealt() {
  const { itemId } = await tableFor(db, alice, "dominoes");
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: "boneyard", cards: DOMINOES, shuffle: true }],
  });
  await call(alice, "pile_deal", {
    p_item: itemId,
    p_from: "boneyard",
    p_targets: [
      { slot: "hand:s0", owner: alice, count: 7 },
      { slot: "hand:s1", owner: bob, count: 7 },
    ],
  });
  return itemId;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

test("each player reads their own hand and nobody else's", async () => {
  const itemId = await dealt();

  const mine = await read(alice, itemId);
  const his = await read(bob, itemId);
  const hers = await read(carol, itemId);

  assert.deepEqual(Object.keys(mine), ["hand:s0"]);
  assert.deepEqual(Object.keys(his), ["hand:s1"]);
  assert.deepEqual(hers, {}, "a spectator reads nothing at all");
  assert.equal(mine["hand:s0"].length, 7);
  assert.equal(his["hand:s1"].length, 7);
});

test("a pile nobody owns is readable by nobody, not even the dealer", async () => {
  const itemId = await dealt();
  const mine = await read(alice, itemId);
  assert.equal(mine.boneyard, undefined, "the boneyard stays face down for the dealer too");
});

test("the dealer is never handed the other hands", async () => {
  const itemId = await dealt();
  // Alice dealt. She still only knows her own seven.
  const mine = await read(alice, itemId);
  const his = await read(bob, itemId);
  const overlap = mine["hand:s0"].filter((tile) => his["hand:s1"].includes(tile));
  assert.deepEqual(overlap, [], "two hands never share a tile");
  assert.equal(Object.keys(mine).length, 1);
});

test("the public state says who holds what, and never what it is", async () => {
  const itemId = await dealt();
  const state = await publicState(itemId);

  assert.equal(state.piles?.["hand:s0"].owner, alice);
  assert.equal(state.piles?.["hand:s0"].size, 7);
  assert.equal(state.piles?.["hand:s1"].size, 7);
  assert.equal(state.piles?.boneyard.size, 14);
  assert.equal(state.piles?.boneyard.owner, null);

  // Nothing in the item anyone can read carries a tile.
  const bobs = (await read(bob, itemId))["hand:s1"];
  const text = JSON.stringify(state);
  for (const key of Object.keys(state.piles ?? {})) {
    assert.ok(!("cards" in (state.piles?.[key] ?? {})), `${key} leaked its cards`);
  }
  assert.ok(!text.includes(JSON.stringify(bobs)), "a hand turned up in the public state");
});

test("the shuffle happens where nobody can watch it", async () => {
  const orders = new Set<string>();
  for (let i = 0; i < 6; i += 1) {
    const { itemId } = await tableFor(db, alice);
    await call(alice, "pile_setup", {
      p_item: itemId,
      p_piles: [{ slot: "deck", owner: alice, cards: DOMINOES, shuffle: true }],
    });
    const deck = (await read(alice, itemId)).deck as number[];
    assert.deepEqual([...deck].sort((a, b) => a - b), DOMINOES, "nothing lost or doubled");
    orders.add(JSON.stringify(deck));
  }
  assert.ok(orders.size > 1, "the deck came out in the same order every time");
});

// ---------------------------------------------------------------------------
// Writing directly
// ---------------------------------------------------------------------------

test("nobody can write a pile directly, even their own", async () => {
  const itemId = await dealt();

  await assert.rejects(
    as(db, alice, (tx) =>
      tx.query("update public.secrets set cards = '[]' where item_id = $1", [itemId]).then((r) => {
        if (r.affectedRows === 0) throw new Error("no rows");
        return r;
      }),
    ),
  );
  await assert.rejects(
    as(db, bob, (tx) =>
      tx.query(
        `insert into public.secrets (item_id, room_id, slot, owner_id, cards)
         select id, room_id, 'hand:s9', $2, '[1]' from public.items where id = $1`,
        [itemId, bob],
      ),
    ),
  );
  const { rows } = await as(db, bob, (tx) =>
    tx.query("delete from public.secrets where item_id = $1 returning slot", [itemId]),
  );
  assert.equal(rows.length, 0, "a delete went through");
});

test("the helpers cannot be called from outside", async () => {
  const itemId = await dealt();
  await assert.rejects(
    as(db, bob, (tx) => tx.query("select public._pile_sync($1, null)", [itemId])),
    /permission denied/,
  );
  await assert.rejects(
    as(db, bob, (tx) => tx.query("select public._publish($1, 'hand:s0', '[]')", [itemId])),
    /permission denied/,
  );
});

// ---------------------------------------------------------------------------
// Drawing and playing
// ---------------------------------------------------------------------------

test("drawing moves the top of the boneyard into your own hand", async () => {
  const itemId = await dealt();
  const drawn = await call(bob, "pile_draw", {
    p_item: itemId,
    p_from: "boneyard",
    p_to: "hand:s1",
  });
  const got = (drawn.rows[0] as { out: unknown[] }).out;
  assert.equal(got.length, 1);

  const his = (await read(bob, itemId))["hand:s1"];
  assert.equal(his.length, 8);
  assert.deepEqual(his[0], got[0], "the drawn tile is on top of the hand");
  assert.equal((await publicState(itemId)).piles?.boneyard.size, 13);
});

test("you cannot draw into somebody else's hand", async () => {
  const itemId = await dealt();
  await assert.rejects(
    call(bob, "pile_draw", { p_item: itemId, p_from: "boneyard", p_to: "hand:s0" }),
    /own hand/,
  );
});

test("playing a tile takes it from your hand and puts it on the table in one go", async () => {
  const itemId = await dealt();
  const tile = (await read(bob, itemId))["hand:s1"][0];

  await call(bob, "pile_take", {
    p_item: itemId,
    p_from: "hand:s1",
    p_cards: [tile],
    p_public: { game: "dominoes", state: { line: [tile] } },
  });

  const state = await publicState(itemId);
  assert.deepEqual(state.line, [tile]);
  assert.equal(state.piles?.["hand:s1"].size, 6);
  assert.ok(!(await read(bob, itemId))["hand:s1"].includes(tile));
});

test("you cannot play a tile you do not hold", async () => {
  const itemId = await dealt();
  const hers = (await read(alice, itemId))["hand:s0"];
  await assert.rejects(
    call(bob, "pile_take", {
      p_item: itemId,
      p_from: "hand:s1",
      p_cards: [hers[0]],
      p_public: { game: "dominoes", state: {} },
    }),
    /not in/,
  );
});

test("you cannot play out of somebody else's hand", async () => {
  const itemId = await dealt();
  const hers = (await read(alice, itemId))["hand:s0"];
  await assert.rejects(
    call(bob, "pile_take", {
      p_item: itemId,
      p_from: "hand:s0",
      p_cards: [hers[0]],
      p_public: { game: "dominoes", state: {} },
    }),
    /not yours/,
  );
});

test("a failed play leaves the public state untouched", async () => {
  const itemId = await dealt();
  const before = await publicState(itemId);
  await assert.rejects(
    call(bob, "pile_take", {
      p_item: itemId,
      p_from: "hand:s1",
      p_cards: [999],
      p_public: { game: "dominoes", state: { line: ["forged"] } },
    }),
  );
  assert.deepEqual(await publicState(itemId), before);
});

// ---------------------------------------------------------------------------
// Moving between piles
// ---------------------------------------------------------------------------

test("moving named cards only works out of a pile you own", async () => {
  const itemId = await dealt();
  const hers = (await read(alice, itemId))["hand:s0"];
  await assert.rejects(
    call(bob, "pile_move", {
      p_item: itemId,
      p_from: "hand:s0",
      p_to: "hand:s1",
      p_cards: [hers[0]],
    }),
    /not yours/,
  );
});

test("taking off the top of somebody's hand is refused", async () => {
  const itemId = await dealt();
  await assert.rejects(
    call(bob, "pile_move", { p_item: itemId, p_from: "hand:s0", p_to: "hand:s1", p_count: 1 }),
    /not yours/,
  );
});

test("a random steal takes a card blind, and only the thief sees what", async () => {
  const itemId = await dealt();
  const out = await call(bob, "pile_move", {
    p_item: itemId,
    p_from: "hand:s0",
    p_to: "hand:s1",
    p_random: true,
  });
  const stolen = (out.rows[0] as { out: unknown[] }).out;
  assert.equal(stolen.length, 1);
  assert.equal((await read(alice, itemId))["hand:s0"].length, 6);
  assert.ok((await read(bob, itemId))["hand:s1"].includes(stolen[0]));
});

test("moving blind into a pile nobody owns tells the mover nothing", async () => {
  const itemId = await dealt();
  const out = await call(bob, "pile_move", {
    p_item: itemId,
    p_from: "boneyard",
    p_to: "burned",
    p_count: 2,
  });
  assert.equal((out.rows[0] as { out: unknown }).out, null);
  assert.equal((await read(bob, itemId)).burned, undefined);
  assert.equal((await publicState(itemId)).piles?.burned.size, 2);
});

test("putting known cards face down makes a pile nobody can read", async () => {
  const { itemId } = await tableFor(db, alice);
  await call(alice, "pile_put", { p_item: itemId, p_to: "table:c1", p_cards: ["AS"] });
  assert.equal((await read(alice, itemId))["table:c1"], undefined);
  assert.equal((await publicState(itemId)).piles?.["table:c1"].size, 1);
});

test("cutting keeps every card and changes the order", async () => {
  const { itemId } = await tableFor(db, alice);
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: "deck", owner: alice, cards: [1, 2, 3, 4, 5] }],
  });
  await call(alice, "pile_cut", { p_item: itemId, p_slot: "deck", p_at: 2 });
  assert.deepEqual((await read(alice, itemId)).deck, [3, 4, 5, 1, 2]);
});

// ---------------------------------------------------------------------------
// Turning things over
// ---------------------------------------------------------------------------

test("turning over the top of a face-down deck shows it to everyone", async () => {
  const itemId = await dealt();
  await call(bob, "pile_reveal", { p_item: itemId, p_slots: ["boneyard"], p_count: 1 });
  const state = await publicState(itemId);
  assert.equal(state.revealed?.boneyard.length, 1);
  assert.equal(state.piles?.boneyard.size, 13);
});

test("you may turn over your own hand", async () => {
  const itemId = await dealt();
  const mine = (await read(alice, itemId))["hand:s0"];
  await call(alice, "pile_reveal", { p_item: itemId, p_slots: ["hand:s0"], p_keep: true });
  assert.deepEqual((await publicState(itemId)).revealed?.["hand:s0"], mine);
});

test("nobody may turn over somebody else's hand", async () => {
  const itemId = await dealt();
  await assert.rejects(
    call(bob, "pile_reveal", { p_item: itemId, p_slots: ["hand:s0"] }),
    /only its owner/,
  );
  assert.equal((await publicState(itemId)).revealed, undefined);
});

test("sealed picks stay shut until everyone has picked", async () => {
  const { itemId } = await tableFor(db, alice, "rps");
  const seal = ["pick:s0", "pick:s1"];

  await call(alice, "pile_put", {
    p_item: itemId,
    p_to: "pick:s0",
    p_cards: ["rock"],
    p_to_owner: alice,
    p_seal: seal,
  });
  // Bob would love to see Alice's pick before making his own.
  await call(bob, "pile_put", {
    p_item: itemId,
    p_to: "pick:s1",
    p_cards: [],
    p_to_owner: bob,
    p_seal: seal,
  });
  await assert.rejects(
    call(bob, "pile_reveal", { p_item: itemId, p_slots: seal }),
    /not everyone has committed/,
  );

  await call(bob, "pile_put", { p_item: itemId, p_to: "pick:s1", p_cards: ["paper"] });
  await call(bob, "pile_reveal", { p_item: itemId, p_slots: seal });
  const shown = (await publicState(itemId)).revealed;
  assert.deepEqual(shown?.["pick:s0"], ["rock"]);
  assert.deepEqual(shown?.["pick:s1"], ["paper"]);
});

test("a peek tells only the one who looked, and the table sees they looked", async () => {
  const { itemId } = await tableFor(db, alice, "buckshot");
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: "chamber", cards: ["live", "blank", "blank"], shuffle: true }],
  });
  const out = await call(bob, "pile_peek", { p_item: itemId, p_slot: "chamber" });
  const shell = (out.rows[0] as { out: string }).out;
  assert.ok(["live", "blank"].includes(shell));

  const state = await publicState(itemId);
  assert.equal(state.peeked?.at(-1)?.by, bob);
  assert.equal(state.revealed, undefined, "a peek does not turn anything over");
});

test("peeking at somebody's hand is refused", async () => {
  const itemId = await dealt();
  await assert.rejects(
    call(bob, "pile_peek", { p_item: itemId, p_slot: "hand:s0" }),
    /belongs to someone/,
  );
});

test("showing a card gives one person a private copy", async () => {
  const itemId = await dealt();
  const card = (await read(alice, itemId))["hand:s0"][0];
  await call(alice, "pile_show", {
    p_item: itemId,
    p_from: "hand:s0",
    p_cards: [card],
    p_viewer: bob,
    p_to: "shown:s1",
  });
  assert.deepEqual((await read(bob, itemId))["shown:s1"], [card]);
  assert.equal((await read(carol, itemId))["shown:s1"], undefined);
  assert.equal((await read(alice, itemId))["hand:s0"].length, 7, "she still has it");
});

test("only the owner can hand a pile over", async () => {
  const itemId = await dealt();
  await assert.rejects(
    call(bob, "pile_give", { p_item: itemId, p_slot: "hand:s0", p_owner: bob }),
    /not yours/,
  );
  await call(alice, "pile_give", { p_item: itemId, p_slot: "hand:s0", p_owner: carol });
  assert.equal((await read(carol, itemId))["hand:s0"].length, 7);
  assert.equal((await read(alice, itemId))["hand:s0"], undefined);
});

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

test("a locked room refuses everyone but its owner", async () => {
  const itemId = await dealt();
  const { rows } = await db.query<{ room_id: string }>(
    "select room_id from public.items where id = $1",
    [itemId],
  );
  await db.query("update public.rooms set locked = true where id = $1", [rows[0].room_id]);

  await assert.rejects(
    call(bob, "pile_draw", { p_item: itemId, p_from: "boneyard", p_to: "hand:s1" }),
    /locked/,
  );
  await call(alice, "pile_shuffle", { p_item: itemId, p_slot: "boneyard" });
});

test("a fresh setup forgets what the last round turned over", async () => {
  const itemId = await dealt();
  await call(bob, "pile_reveal", { p_item: itemId, p_slots: ["boneyard"], p_count: 1 });
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: "boneyard", cards: DOMINOES, shuffle: true }],
  });
  assert.equal((await publicState(itemId)).revealed, undefined);
});

test("deleting the item takes its piles with it", async () => {
  const itemId = await dealt();
  await db.query("delete from public.items where id = $1", [itemId]);
  const { rows } = await db.query("select 1 from public.secrets where item_id = $1", [itemId]);
  assert.equal(rows.length, 0);
});

// ---------------------------------------------------------------------------
// The pieces the hidden-role games need
// ---------------------------------------------------------------------------

test("a setup with choices picks one deck, and the dealer cannot tell which", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 12; i += 1) {
    const { itemId } = await tableFor(db, alice, "spyfall");
    await call(alice, "pile_setup", {
      p_item: itemId,
      p_piles: [{ slot: "briefings", choices: [["beach"], ["bank"], ["circus"]] }],
    });
    // Alice dealt it; she still cannot read it.
    assert.equal((await read(alice, itemId)).briefings, undefined);
    await call(alice, "pile_reveal", { p_item: itemId, p_slots: ["briefings"] });
    seen.add(String((await publicState(itemId)).revealed?.briefings?.[0]));
  }
  assert.ok(seen.size > 1, "the same choice came up every time");
  for (const place of seen) assert.ok(["beach", "bank", "circus"].includes(place));
});

test("copies give several people the same pile in the same order", async () => {
  const { itemId } = await tableFor(db, alice, "codenames");
  const key = Array.from({ length: 25 }, (_, i) => (i < 9 ? "red" : i < 17 ? "blue" : i < 24 ? "neutral" : "assassin"));
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [
      {
        slot: "key",
        cards: key,
        shuffle: true,
        copies: [
          { slot: "key:red", owner: bob },
          { slot: "key:blue", owner: carol },
        ],
      },
    ],
  });
  const bobs = (await read(bob, itemId))["key:red"];
  const carols = (await read(carol, itemId))["key:blue"];
  assert.deepEqual(bobs, carols, "both spymasters hold the same key");
  assert.equal((await read(alice, itemId))["key:red"], undefined, "a guesser holds nothing");
  assert.equal((await read(alice, itemId)).key, undefined);
});

test("one card can be turned over by its place in the pile, leaving the rest", async () => {
  const { itemId } = await tableFor(db, alice, "codenames");
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: "key", cards: ["red", "blue", "assassin"] }],
  });
  await call(bob, "pile_reveal", { p_item: itemId, p_slots: ["key"], p_at: 2, p_keep: true, p_as: "word:2" });
  const state = await publicState(itemId);
  assert.deepEqual(state.revealed?.["word:2"], ["assassin"]);
  assert.equal(state.revealed?.key, undefined, "the rest of the key stays hidden");
  assert.equal(state.piles?.key.size, 3);
});

test("a pooled reveal says what was played but not by whom", async () => {
  const { itemId } = await tableFor(db, alice, "resistance");
  const seal = ["play:s0", "play:s1"];
  await call(alice, "pile_put", { p_item: itemId, p_to: "play:s0", p_cards: ["fail"], p_to_owner: alice, p_seal: seal });
  await call(bob, "pile_put", { p_item: itemId, p_to: "play:s1", p_cards: ["success"], p_to_owner: bob, p_seal: seal });
  await call(carol, "pile_reveal", { p_item: itemId, p_slots: seal, p_pool: "mission" });
  const state = await publicState(itemId);
  assert.deepEqual([...(state.revealed?.mission as string[])].sort(), ["fail", "success"]);
  assert.equal(state.revealed?.["play:s0"], undefined, "nobody's own card is shown");
  assert.equal(state.revealed?.["play:s1"], undefined);
});

test("nobody can put cards into somebody else's pile by naming them", async () => {
  const itemId = await dealt();
  await assert.rejects(
    call(bob, "pile_put", { p_item: itemId, p_to: "hand:s0", p_cards: [99] }),
    /not yours/,
  );
});

test("asking whether a pile holds a card answers everyone at once", async () => {
  const { itemId } = await tableFor(db, alice, "coup");
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: "hand:s0", owner: alice, cards: ["captain", "contessa"] }],
  });
  const has = await call(bob, "pile_test", { p_item: itemId, p_slot: "hand:s0", p_card: JSON.stringify("duke") });
  assert.equal((has.rows[0] as { out: boolean }).out, false);
  const tested = (await publicState(itemId)).tested as Array<{ card: string; found: boolean; by: string }>;
  assert.deepEqual(
    { card: tested.at(-1)?.card, found: tested.at(-1)?.found, by: tested.at(-1)?.by },
    { card: "duke", found: false, by: bob },
  );
  assert.equal((await read(bob, itemId))["hand:s0"], undefined, "Bob learned the answer, not the hand");
});

test("the people dealt the same card find each other, and nobody else learns a thing", async () => {
  const { itemId } = await tableFor(db, alice, "resistance");
  const dave = await newUser(db);
  await call(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [
      { slot: "role:s0", owner: alice, cards: ["spy"] },
      { slot: "role:s1", owner: bob, cards: ["rebel"] },
      { slot: "role:s2", owner: carol, cards: ["spy"] },
      { slot: "role:s3", owner: dave, cards: ["rebel"] },
    ],
  });
  await call(bob, "pile_team", { p_item: itemId, p_prefix: "role:", p_card: JSON.stringify("spy"), p_to_prefix: "team:" });

  assert.deepEqual((await read(alice, itemId))["team:s0"], ["s0", "s2"]);
  assert.deepEqual((await read(carol, itemId))["team:s2"], ["s0", "s2"]);
  assert.equal((await read(bob, itemId))["team:s1"], undefined, "a rebel is told nothing");
  assert.equal((await read(dave, itemId))["team:s3"], undefined);
});
