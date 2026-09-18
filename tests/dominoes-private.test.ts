// Dominoes with hands nobody else can read. The pure half checks the dealing
// and turn logic the component uses; the database half plays a round through
// the real pile functions and checks what each person could see at each step.

import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  BONEYARD,
  DEAL_EACH,
  afterPlay,
  dealTargets,
  fullSet,
  handSlot,
  pickLead,
  playableSides,
  publicOnly,
  roundStatus,
  tally,
  type Line,
  type Tile,
} from "../src/lib/dominoes.ts";

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

test("each chair's hand goes to the person sitting in it", () => {
  const targets = dealTargets(["s0", "s1"], { s0: "alice", s1: "bob" }, "alice");
  assert.deepEqual(targets, [
    { slot: "hand:s0", owner: "alice", count: DEAL_EACH },
    { slot: "hand:s1", owner: "bob", count: DEAL_EACH },
  ]);
});

test("an empty chair's hand stays with whoever dealt, on the phone being passed round", () => {
  const targets = dealTargets(["s0", "s1", "s2"], { s0: "bob" }, "alice");
  assert.equal(targets.find((t) => t.slot === "hand:s0")?.owner, "bob");
  assert.equal(targets.find((t) => t.slot === "hand:s1")?.owner, "alice");
  assert.equal(targets.find((t) => t.slot === "hand:s2")?.owner, "alice");
});

test("nobody who is not at the table is ever dealt a hand", () => {
  const targets = dealTargets(["s0", "s1"], { s0: "bob", s1: "carol" }, "alice");
  assert.ok(!targets.some((t) => t.owner === "alice"), "the dealer took a hand without a chair");
});

test("dealing asks for seven each and names no tile", () => {
  for (const t of dealTargets(["s0", "s1", "s2", "s3"], {}, "alice")) {
    assert.equal(t.count, 7);
    assert.deepEqual(Object.keys(t).sort(), ["count", "owner", "slot"]);
  }
});

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

test("the last winner leads the next round", () => {
  assert.equal(pickLead(["s0", "s1", "s2"], "s2"), "s2");
});

test("a first round, or a dead heat, leads from a chair at random", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i += 1) seen.add(pickLead(["s0", "s1", "s2"], null));
  assert.ok(seen.size > 1);
  assert.equal(pickLead(["s0", "s1"], null, () => 0.99), "s1");
});

test("playing passes the turn along and resets the passes", () => {
  const next = afterPlay({ line: [], turn: "s0", round: 1 }, ["s0", "s1"], [3, 5], "left", 7);
  assert.deepEqual(next, { line: [[3, 5]], passes: 0, turn: "s1", results: {} });
});

test("playing your last tile takes the round and keeps the turn where it is", () => {
  const next = afterPlay(
    { line: [[5, 5]], turn: "s1", round: 2, results: { "1": "s0" } },
    ["s0", "s1"],
    [5, 2],
    "right",
    1,
  );
  assert.equal(next?.turn, "s1");
  assert.deepEqual(next?.results, { "1": "s0", "2": "s1" });
});

test("a tile that does not fit is not played", () => {
  assert.equal(afterPlay({ line: [[1, 1]], turn: "s0" }, ["s0", "s1"], [4, 4], "left", 7), null);
});

// ---------------------------------------------------------------------------
// Where the round stands, from what everyone can see
// ---------------------------------------------------------------------------

const sizes = (hands: Record<string, number>, boneyard = 14) => {
  const out: Record<string, { size: number }> = { [BONEYARD]: { size: boneyard } };
  for (const [chair, size] of Object.entries(hands)) out[handSlot(chair)] = { size };
  return out;
};

test("before a deal there is nothing to play", () => {
  assert.deepEqual(roundStatus(["s0", "s1"], undefined, 0, undefined), { kind: "idle" });
});

test("an empty hand means someone went out", () => {
  const status = roundStatus(["s0", "s1"], sizes({ s0: 3, s1: 0 }), 0, undefined);
  assert.deepEqual(status, { kind: "out", seat: "s1" });
});

test("everyone passing blocks the round, and it waits for the hands to be shown", () => {
  const status = roundStatus(["s0", "s1"], sizes({ s0: 2, s1: 3 }, 0), 2, {
    [handSlot("s0")]: [[1, 2]],
  });
  assert.deepEqual(status, { kind: "counting", waitingOn: ["s1"] });
});

test("once every hand is shown, the lightest takes it", () => {
  const status = roundStatus(["s0", "s1"], sizes({ s0: 2, s1: 1 }, 0), 2, {
    [handSlot("s0")]: [
      [6, 6],
      [5, 4],
    ],
    [handSlot("s1")]: [[1, 0]],
  });
  assert.deepEqual(status, { kind: "blocked", seat: "s1" });
});

test("a tie on pips gives nobody the round", () => {
  const status = roundStatus(["s0", "s1"], sizes({ s0: 1, s1: 1 }, 0), 2, {
    [handSlot("s0")]: [[2, 2]],
    [handSlot("s1")]: [[3, 1]],
  });
  assert.deepEqual(status, { kind: "blocked", seat: null });
});

test("round wins are counted from the record, so writing one twice counts once", () => {
  assert.deepEqual(tally({ "1": "s0", "2": "s1", "3": "s0", "4": null }), { s0: 2, s1: 1 });
});

test("anything that ever held a hand is stripped before writing", () => {
  const legacy = {
    line: [],
    hands: { s0: [[1, 2]] },
    boneyard: [[3, 4]],
    wins: { s0: 1 },
    piles: { boneyard: { owner: null, size: 14, at: 0, sealed: false } },
    turn: "s0",
  };
  const clean = publicOnly(legacy);
  assert.deepEqual(Object.keys(clean).sort(), ["line", "turn"]);
});

// ---------------------------------------------------------------------------
// A round against the real database
// ---------------------------------------------------------------------------

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

async function rpc(user: string, fn: string, args: Record<string, unknown>) {
  const names = Object.keys(args);
  const params = names.map((name) =>
    typeof args[name] === "object" && args[name] !== null && name !== "p_slots"
      ? JSON.stringify(args[name])
      : args[name],
  );
  const call = names.map((name, i) => `${name} => $${i + 1}`).join(", ");
  const { rows } = await as(db, user, (tx) =>
    tx.query<{ out: unknown }>(`select public.${fn}(${call}) as out`, params),
  );
  return rows[0]?.out;
}

async function hands(user: string, itemId: string) {
  const { rows } = await as(db, user, (tx) =>
    tx.query<{ slot: string; cards: Tile[] }>(
      "select slot, cards from public.secrets where item_id = $1",
      [itemId],
    ),
  );
  return Object.fromEntries(rows.map((r) => [r.slot, r.cards]));
}

async function table(itemId: string) {
  const { rows } = await db.query<{ data: { state: Record<string, unknown> } }>(
    "select data from public.items where id = $1",
    [itemId],
  );
  return rows[0].data.state;
}

test("a dealt round: two players, a spectator, and nobody sees another hand", async () => {
  const { itemId } = await tableFor(db, alice, "dominoes");
  const chairs = ["s0", "s1"];
  const holders = { s0: alice, s1: bob };

  await rpc(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: BONEYARD, cards: fullSet(), shuffle: true }],
    p_public: { game: "dominoes", state: { line: [], turn: "s0", round: 1, passes: 0 } },
  });
  await rpc(alice, "pile_deal", {
    p_item: itemId,
    p_from: BONEYARD,
    p_targets: dealTargets(chairs, holders, alice),
  });

  const a = await hands(alice, itemId);
  const b = await hands(bob, itemId);
  const c = await hands(carol, itemId);

  assert.deepEqual(Object.keys(a), [handSlot("s0")]);
  assert.deepEqual(Object.keys(b), [handSlot("s1")]);
  assert.deepEqual(c, {}, "the spectator reads nothing");
  assert.equal(a[handSlot("s0")].length, 7);
  assert.equal(b[handSlot("s1")].length, 7);

  // The whole public state, as any of the three would receive it, carries no
  // tile at all: no hand, no boneyard, only sizes.
  const shared = JSON.stringify(await table(itemId));
  for (const tile of [...a[handSlot("s0")], ...b[handSlot("s1")]]) {
    assert.ok(!shared.includes(JSON.stringify(tile)), `${tile} is in the shared state`);
  }

  // Alice leads with a tile she holds, through the same logic the table uses.
  const lead = a[handSlot("s0")][0];
  const next = afterPlay({ line: [], turn: "s0", round: 1 }, chairs, lead, "left", 7);
  assert.ok(next);
  await rpc(alice, "pile_take", {
    p_item: itemId,
    p_from: handSlot("s0"),
    p_cards: [lead],
    p_public: { game: "dominoes", state: { ...next, round: 1 } },
  });

  const after = await table(itemId);
  assert.deepEqual(after.line, [lead]);
  assert.equal(after.turn, "s1");
  const piles = after.piles as Record<string, { size: number }>;
  assert.equal(piles[handSlot("s0")].size, 6);
  assert.equal(piles[handSlot("s1")].size, 7);

  // Bob cannot play one of Alice's remaining tiles, and cannot draw into her hand.
  const hers = (await hands(alice, itemId))[handSlot("s0")];
  await assert.rejects(
    rpc(bob, "pile_take", {
      p_item: itemId,
      p_from: handSlot("s1"),
      p_cards: [hers[0]],
      p_public: { game: "dominoes", state: {} },
    }),
  );
  await assert.rejects(
    rpc(bob, "pile_draw", { p_item: itemId, p_from: BONEYARD, p_to: handSlot("s0") }),
  );

  // He can draw into his own, and only he learns what he drew.
  const drawn = (await rpc(bob, "pile_draw", {
    p_item: itemId,
    p_from: BONEYARD,
    p_to: handSlot("s1"),
  })) as Tile[];
  assert.equal(drawn.length, 1);
  assert.equal((await hands(bob, itemId))[handSlot("s1")].length, 8);
  assert.equal((await hands(alice, itemId))[handSlot("s1")], undefined);
});

test("a blocked round turns each hand over only when its owner does", async () => {
  const { itemId } = await tableFor(db, alice, "dominoes");
  await rpc(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: BONEYARD, cards: fullSet(), shuffle: true }],
  });
  await rpc(alice, "pile_deal", {
    p_item: itemId,
    p_from: BONEYARD,
    p_targets: dealTargets(["s0", "s1"], { s0: alice, s1: bob }, alice),
  });

  // Alice would like to count Bob's hand for him.
  await assert.rejects(
    rpc(alice, "pile_reveal", { p_item: itemId, p_slots: [handSlot("s1")], p_keep: true }),
  );

  await rpc(alice, "pile_reveal", { p_item: itemId, p_slots: [handSlot("s0")], p_keep: true });
  let shown = (await table(itemId)).revealed as Record<string, Tile[]>;
  assert.equal(shown[handSlot("s0")].length, 7);
  assert.equal(shown[handSlot("s1")], undefined);

  await rpc(bob, "pile_reveal", { p_item: itemId, p_slots: [handSlot("s1")], p_keep: true });
  shown = (await table(itemId)).revealed as Record<string, Tile[]>;
  assert.equal(shown[handSlot("s1")].length, 7);

  // With both shown, the round can be counted by anyone from the public state.
  const piles = (await table(itemId)).piles as Record<string, { size: number }>;
  const status = roundStatus(["s0", "s1"], piles, 2, shown);
  assert.equal(status.kind, "blocked");
});

test("the tile you hold is only playable where it fits", () => {
  const line: Line = [[2, 5]];
  assert.deepEqual(playableSides(line, [5, 1]), ["right"]);
  assert.deepEqual(playableSides(line, [2, 5]), ["left", "right"]);
  assert.deepEqual(playableSides(line, [3, 3]), []);
});
