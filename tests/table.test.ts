import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  MAJOR_ARCANA,
  cutStack,
  dealFrom,
  deckCards,
  drawToHand,
  emptyTable,
  flipStack,
  giveCard,
  handSlot,
  mergeStacks,
  moveStacks,
  playFromHand,
  presetDecks,
  readFace,
  settle,
  setTable,
  shuffleStack,
  splitStack,
  stackSlot,
  takeCard,
  turnTopUp,
  upgrade,
  type Stack,
  type TableState,
} from "../src/lib/table.ts";

/** A predictable random source, so ids and shuffles repeat. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

function laid(preset: Parameters<typeof emptyTable>[0] = "52") {
  const step = setTable(emptyTable(preset), seeded());
  const deck = step.table.stacks.find((s) => s.face === "down") as Stack;
  const discard = step.table.stacks.find((s) => s.label === "discard") as Stack;
  return { step, table: step.table, deck, discard };
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

test("each preset has the cards it says it has", () => {
  const count = (preset: Parameters<typeof presetDecks>[0]) =>
    presetDecks(preset).flatMap(deckCards).length;
  assert.equal(count("52"), 52);
  assert.equal(count("54"), 54);
  assert.equal(count("40"), 40);
  assert.equal(count("canasta"), 108);
  assert.equal(count("tarot"), 78);
});

test("a tarot deck is twenty-two major arcana and four suits of fourteen", () => {
  const [deck] = presetDecks("tarot");
  const cards = deckCards(deck);
  const faces = cards.map((c) => readFace(c, [deck]).face);
  assert.equal(faces.filter((f) => f.kind === "major").length, MAJOR_ARCANA.length);
  assert.equal(faces.filter((f) => f.kind === "minor").length, 56);
  assert.deepEqual(readFace(`${deck.id}|M13`, [deck]).face, { kind: "major", n: 13, name: "Death" });
  assert.equal(
    (readFace(`${deck.id}|C12`, [deck]).face as { name: string }).name,
    "Knight of cups",
  );
});

test("custom cards come in as many copies as asked for", () => {
  const deck = {
    id: "x",
    name: "mine",
    kind: "custom" as const,
    custom: [
      { id: "a", title: "yes", color: "#fff", copies: 3 },
      { id: "b", title: "no", color: "#000", copies: 1 },
    ],
    back: { color: "#123", pattern: "plain" as const },
  };
  const cards = deckCards(deck);
  assert.equal(cards.length, 4);
  assert.equal((readFace(cards[0], [deck]).face as { card: { title: string } }).card.title, "yes");
});

test("cards from two decks stay tagged with the deck they came from", () => {
  const decks = [...presetDecks("52", "d1"), ...presetDecks("tarot", "d2")];
  const cards = decks.flatMap(deckCards);
  assert.equal(new Set(cards).size, cards.length, "no card from one deck mistaken for another");
  assert.equal(readFace("d1|QH", decks).deck?.id, "d1");
  assert.equal(readFace("d2|M0", decks).face.kind, "major");
});

// ---------------------------------------------------------------------------
// Setting the table
// ---------------------------------------------------------------------------

test("setting the table lays each deck face down and shuffles it out of sight", () => {
  const { step, deck, discard } = laid();
  assert.equal(step.call?.fn, "pile_setup");
  const piles = step.call?.args.p_piles as Array<{ slot: string; cards: string[]; shuffle: boolean }>;
  assert.equal(piles.length, 1);
  assert.equal(piles[0].slot, stackSlot(deck.id));
  assert.equal(piles[0].cards.length, 52);
  assert.equal(piles[0].shuffle, true);
  assert.equal(deck.cards, undefined, "a face-down deck carries no cards in public");
  assert.deepEqual(discard.cards, []);
});

// ---------------------------------------------------------------------------
// Moving cards about
// ---------------------------------------------------------------------------

test("drawing from a face-down stack goes pile to pile, never through the table", () => {
  const { table, deck } = laid();
  const step = drawToHand(table, deck.id, "s1", "bob");
  assert.equal(step.table, table, "the public state is unchanged");
  assert.deepEqual(step.call, {
    fn: "pile_move",
    args: { p_from: stackSlot(deck.id), p_to: handSlot("s1"), p_count: 1, p_to_owner: "bob" },
  });
});

test("drawing from a face-up stack takes its top card into the hand", () => {
  const { table, discard } = laid();
  const shown = { ...table, stacks: table.stacks.map((s) => (s.id === discard.id ? { ...s, cards: ["d1|KS", "d1|2H"] } : s)) };
  const step = drawToHand(shown, discard.id, "s0", "alice");
  assert.deepEqual(step.table.stacks.find((s) => s.id === discard.id)?.cards, ["d1|2H"]);
  assert.deepEqual(step.call?.args.p_cards, ["d1|KS"]);
});

test("a card played face up goes on the table for everyone", () => {
  const { table } = laid();
  const step = playFromHand(table, "s0", "d1|7C", { kind: "new", x: 0.5, y: 0.7, face: "up" }, seeded(3));
  const placed = step.table.stacks.at(-1) as Stack;
  assert.equal(placed.face, "up");
  assert.deepEqual(placed.cards, ["d1|7C"]);
  assert.deepEqual(step.call, { fn: "pile_take", args: { p_from: handSlot("s0"), p_cards: ["d1|7C"] } });
});

test("a card played face down never touches the public state", () => {
  const { table } = laid();
  const step = playFromHand(table, "s0", "d1|7C", { kind: "new", x: 0.5, y: 0.7, face: "down" }, seeded(3));
  const placed = step.table.stacks.at(-1) as Stack;
  assert.equal(placed.face, "down");
  assert.equal(placed.cards, undefined);
  assert.ok(!JSON.stringify(step.table).includes("7C"), "the card is in the public state");
  assert.equal(step.call?.fn, "pile_move");
  assert.equal(step.call?.args.p_to_owner, null, "nobody may read it, not even whoever played it");
});

test("a card kept face down in front of you is still yours to read", () => {
  const { table } = laid();
  const step = playFromHand(
    table,
    "s0",
    "d1|AH",
    { kind: "new", x: 0.2, y: 0.8, face: "down", mine: { chair: "s0", owner: "alice" } },
    seeded(3),
  );
  assert.equal((step.table.stacks.at(-1) as Stack).owner, "s0");
  assert.equal(step.call?.args.p_to_owner, "alice");
});

test("playing onto a stack takes that stack's facing", () => {
  const { table, deck, discard } = laid();
  const up = playFromHand(table, "s0", "d1|9D", { kind: "onto", id: discard.id });
  assert.deepEqual(up.table.stacks.find((s) => s.id === discard.id)?.cards, ["d1|9D"]);
  assert.equal(up.call?.fn, "pile_take");

  const down = playFromHand(table, "s0", "d1|9D", { kind: "onto", id: deck.id });
  assert.equal(down.call?.fn, "pile_move");
  assert.equal(down.call?.args.p_to, stackSlot(deck.id));
  assert.ok(!JSON.stringify(down.table).includes("9D"));
});

test("turning a face-up stack down reverses it into a pile nobody reads", () => {
  const { table, discard } = laid();
  const shown = { ...table, stacks: table.stacks.map((s) => (s.id === discard.id ? { ...s, cards: ["top", "mid", "bottom"] } : s)) };
  const step = flipStack(shown, discard.id);
  const flipped = step.table.stacks.find((s) => s.id === discard.id) as Stack;
  assert.equal(flipped.face, "down");
  assert.equal(flipped.cards, undefined);
  assert.deepEqual(step.call?.args.p_cards, ["bottom", "mid", "top"]);
  assert.equal(step.call?.args.p_to_owner, undefined, "no owner, so nobody can read it");
});

test("turning a face-down stack up is left to the database, in front of everyone", () => {
  const { table, deck } = laid();
  const step = flipStack(table, deck.id);
  assert.deepEqual(step.call, { fn: "pile_reveal", args: { p_slots: [stackSlot(deck.id)] } });
});

test("what the database turned over lands in its stack, reversed, once", () => {
  const { table, deck } = laid();
  const turned: TableState = { ...table, revealed: { [stackSlot(deck.id)]: ["was top", "was bottom"] } };
  const settled = settle(turned);
  assert.ok(settled);
  const stack = settled.table.stacks.find((s) => s.id === deck.id) as Stack;
  assert.equal(stack.face, "up");
  assert.deepEqual(stack.cards, ["was bottom", "was top"]);
  assert.deepEqual(settled.drop, [stackSlot(deck.id)]);
  assert.equal(settled.table.revealed?.[stackSlot(deck.id)], undefined);
  assert.equal(settle(settled.table), null, "a second pass has nothing to do");
});

test("turning the top card up takes two steps: set it aside, then turn it", () => {
  const { table, deck } = laid();
  const step = turnTopUp(table, deck.id, seeded(9));
  const fresh = step.table.stacks.at(-1) as Stack;
  assert.equal(step.call?.fn, "pile_move");
  assert.equal(step.call?.args.p_to, stackSlot(fresh.id));
  assert.deepEqual(step.then, { fn: "pile_reveal", args: { p_slots: [stackSlot(fresh.id)] } });
});

test("stacks facing the same way merge; facing opposite ways they just sit together", () => {
  const { table, discard } = laid();
  const a = playFromHand(table, "s0", "d1|2C", { kind: "new", x: 0.1, y: 0.1, face: "up" }, seeded(1)).table;
  const placed = a.stacks.at(-1) as Stack;
  const withDiscard = { ...a, stacks: a.stacks.map((s) => (s.id === discard.id ? { ...s, cards: ["d1|3C"] } : s)) };

  const merged = mergeStacks(withDiscard, placed.id, discard.id);
  assert.equal(merged.table.stacks.some((s) => s.id === placed.id), false);
  assert.deepEqual(merged.table.stacks.find((s) => s.id === discard.id)?.cards, ["d1|2C", "d1|3C"]);

  const deck = a.stacks.find((s) => s.face === "down") as Stack;
  const apart = mergeStacks(withDiscard, placed.id, deck.id);
  assert.equal(apart.call, undefined);
  assert.ok(apart.table.stacks.some((s) => s.id === placed.id), "not merged into a face-down pile");
});

test("face-down stacks merge inside the database", () => {
  const { table } = laid();
  const second = playFromHand(table, "s0", "d1|5S", { kind: "new", x: 0.8, y: 0.2, face: "down" }, seeded(4)).table;
  const [deck, other] = second.stacks.filter((s) => s.face === "down");
  const step = mergeStacks(second, other.id, deck.id, {
    [stackSlot(other.id)]: { owner: null, size: 1, at: 0, sealed: false },
  });
  assert.deepEqual(step.call?.args, {
    p_from: stackSlot(other.id),
    p_to: stackSlot(deck.id),
    p_count: 1,
  });
});

test("splitting lifts the top of a stack into a new one", () => {
  const { table, discard } = laid();
  const shown = { ...table, stacks: table.stacks.map((s) => (s.id === discard.id ? { ...s, cards: ["a", "b", "c", "d"] } : s)) };
  const step = splitStack(shown, discard.id, 2, seeded(5));
  assert.deepEqual(step.table.stacks.find((s) => s.id === discard.id)?.cards, ["c", "d"]);
  assert.deepEqual((step.table.stacks.at(-1) as Stack).cards, ["a", "b"]);
});

test("a face-down stack is shuffled and cut where nobody can see", () => {
  const { table, deck } = laid();
  assert.deepEqual(shuffleStack(table, deck.id).call, {
    fn: "pile_shuffle",
    args: { p_slot: stackSlot(deck.id) },
  });
  assert.deepEqual(cutStack(table, deck.id, null).call, {
    fn: "pile_cut",
    args: { p_slot: stackSlot(deck.id), p_at: null },
  });
});

test("a face-up stack shuffles and cuts in the open, losing nothing", () => {
  const { table, discard } = laid();
  const cards = ["a", "b", "c", "d", "e", "f"];
  const shown = { ...table, stacks: table.stacks.map((s) => (s.id === discard.id ? { ...s, cards } : s)) };
  const shuffled = shuffleStack(shown, discard.id, seeded(11)).table.stacks.find((s) => s.id === discard.id)?.cards ?? [];
  assert.deepEqual([...shuffled].sort(), cards);
  const cut = cutStack(shown, discard.id, 2).table.stacks.find((s) => s.id === discard.id)?.cards;
  assert.deepEqual(cut, ["c", "d", "e", "f", "a", "b"]);
});

test("dealing gives each chair's cards to whoever sits there", () => {
  const { table, deck } = laid();
  const seated = { ...table, seatCount: 3, holders: { s0: "alice", s1: "bob" } };
  const step = dealFrom(seated, deck.id, 5, "alice");
  assert.deepEqual(step.call?.args.p_targets, [
    { slot: handSlot("s0"), owner: "alice", count: 5 },
    { slot: handSlot("s1"), owner: "bob", count: 5 },
    { slot: handSlot("s2"), owner: "alice", count: 5 },
  ]);
});

test("a card given to another chair goes to whoever sits there", () => {
  const { table } = laid();
  const step = giveCard({ ...table, holders: { s1: "bob" } }, "s0", "s1", "d1|QS", "alice");
  assert.equal(step.call?.args.p_to_owner, "bob");
  assert.deepEqual(step.call?.args.p_cards, ["d1|QS"]);
});

test("any card can be picked out of a fanned face-up stack", () => {
  const { table, discard } = laid();
  const shown = { ...table, stacks: table.stacks.map((s) => (s.id === discard.id ? { ...s, cards: ["a", "b", "c"] } : s)) };
  const step = takeCard(shown, discard.id, 1, "s0", "alice");
  assert.deepEqual(step.table.stacks.find((s) => s.id === discard.id)?.cards, ["a", "c"]);
  assert.deepEqual(step.call?.args.p_cards, ["b"]);
});

test("a group moves together", () => {
  const { table, deck, discard } = laid();
  const moved = moveStacks(table, [deck.id, discard.id], 0.1, 0.05);
  const before = table.stacks.find((s) => s.id === deck.id) as Stack;
  const after = moved.stacks.find((s) => s.id === deck.id) as Stack;
  assert.ok(Math.abs(after.x - (before.x + 0.1)) < 1e-9);
  assert.ok(Math.abs(after.y - (before.y + 0.05)) < 1e-9);
});

test("an old table comes across without its leaky hands", () => {
  const upgraded = upgrade({
    config: { ranks: ["A", "K"], suits: ["S"], jokers: 0, copies: 1 },
    deck: ["AS", "KS"],
    hands: { s0: ["AS"] },
    seats: { s0: "ana" },
    seatCount: 3,
  });
  assert.equal(upgraded.version, 2);
  assert.deepEqual(upgraded.stacks, []);
  assert.equal(upgraded.seats.s0, "ana");
  assert.ok(!JSON.stringify(upgraded).includes("hands"));
  assert.equal(deckCards(upgraded.decks[0]).length, 2);
});

test("whatever happens at the table, a face-down stack never shows its cards", () => {
  const random = seeded(21);
  let { table } = laid("54");
  const deck = table.stacks.find((s) => s.face === "down") as Stack;
  const moves = [
    () => playFromHand(table, "s0", "d1|AS", { kind: "new", x: 0.3, y: 0.6, face: "down" }, random),
    () => playFromHand(table, "s0", "d1|KD", { kind: "new", x: 0.6, y: 0.6, face: "up" }, random),
    () => flipStack(table, table.stacks.find((s) => s.face === "up" && (s.cards?.length ?? 0) > 0)?.id ?? deck.id),
    () => splitStack(table, deck.id, 3, random),
    () => turnTopUp(table, deck.id, random),
    () => shuffleStack(table, deck.id, random),
  ];
  for (const move of moves) {
    table = move().table;
    for (const stack of table.stacks) {
      if (stack.face === "down") assert.equal(stack.cards, undefined, `stack ${stack.id} leaked`);
    }
  }
});

// ---------------------------------------------------------------------------
// Against the database
// ---------------------------------------------------------------------------

let db: PGlite;
let alice: string;
let bob: string;

before(async () => {
  db = await freshDatabase();
  alice = await newUser(db);
  bob = await newUser(db);
});

async function run(user: string, itemId: string, step: { call?: { fn: string; args: Record<string, unknown> } }, table?: TableState) {
  if (!step.call) return null;
  const args: Record<string, unknown> = { p_item: itemId, ...step.call.args };
  if (table && step.call.fn !== "pile_shuffle" && step.call.fn !== "pile_cut" && step.call.fn !== "pile_reveal") {
    args.p_public = { game: "cards", state: table };
  }
  const names = Object.keys(args);
  const params = names.map((n) =>
    n !== "p_slots" && typeof args[n] === "object" && args[n] !== null ? JSON.stringify(args[n]) : args[n],
  );
  const { rows } = await as(db, user, (tx) =>
    tx.query<{ out: unknown }>(
      `select public.${step.call?.fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as out`,
      params,
    ),
  );
  return rows[0]?.out;
}

async function readAs(user: string, itemId: string) {
  const { rows } = await as(db, user, (tx) =>
    tx.query<{ slot: string; cards: string[] }>("select slot, cards from public.secrets where item_id = $1", [itemId]),
  );
  return Object.fromEntries(rows.map((r) => [r.slot, r.cards]));
}

test("a face-down card on the felt is unreadable, until turned over for everyone", async () => {
  const { itemId } = await tableFor(db, alice);
  const { step, table, deck } = laid();
  await run(alice, itemId, step, table);

  const seated: TableState = { ...table, seatCount: 2, holders: { s0: alice, s1: bob } };
  await run(alice, itemId, dealFrom(seated, deck.id, 3, alice), seated);

  const hand = (await readAs(bob, itemId))[handSlot("s1")];
  assert.equal(hand.length, 3);

  // Bob puts one of his cards face down in the middle.
  const played = playFromHand(seated, "s1", hand[0], { kind: "new", x: 0.5, y: 0.5, face: "down" }, seeded(2));
  await run(bob, itemId, played, played.table);
  const faceDown = played.table.stacks.at(-1) as Stack;

  assert.equal((await readAs(alice, itemId))[stackSlot(faceDown.id)], undefined);
  assert.equal((await readAs(bob, itemId))[stackSlot(faceDown.id)], undefined, "not even Bob, now it is down");

  // Alice turns it over; now it is in the public state for everyone.
  await run(alice, itemId, flipStack(played.table, faceDown.id));
  const { rows } = await db.query<{ data: { state: TableState } }>("select data from public.items where id = $1", [itemId]);
  const settled = settle(rows[0].data.state);
  assert.ok(settled);
  assert.deepEqual(settled.table.stacks.find((s) => s.id === faceDown.id)?.cards, [hand[0]]);
});
