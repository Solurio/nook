import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  CONTINENTS,
  CONTINENT_IDS,
  DECK,
  DECK_PILE,
  DISCARD_PILE,
  EDGES,
  NEIGHBORS,
  TERRITORIES,
  TERRITORY_IDS,
  attack,
  canPlaceOn,
  claimWin,
  emptyWar,
  endTurn,
  fight,
  handSlot,
  inheritance,
  lastStanding,
  moveArmies,
  movable,
  objectiveMet,
  objectivesFor,
  occupy,
  place,
  placementProblem,
  reinforcements,
  startGame,
  stillToPlace,
  stopAttacking,
  territoriesIn,
  trade,
  tradeValue,
  validSet,
  type Territory,
  type WarState,
} from "../src/lib/war.ts";

const first = () => 0;
/** Dice that come up exactly as listed (1 to 6), then repeat. */
const loaded = (...faces: number[]) => {
  let i = 0;
  return () => faces[i++ % faces.length] - 1;
};

/** A board handed out by hand: everything to s1 unless said otherwise. */
function board(own: Partial<Record<Territory, [string, number]>>, extra: Partial<WarState> = {}): WarState {
  const owner: Partial<Record<Territory, string>> = {};
  const armies: Partial<Record<Territory, number>> = {};
  for (const t of TERRITORY_IDS) {
    const [who, n] = own[t] ?? ["s1", 1];
    owner[t] = who;
    armies[t] = n;
  }
  return {
    ...emptyWar(3),
    phase: "play",
    order: ["s0", "s1", "s2"],
    color: { s0: "blue", s1: "red", s2: "green" },
    owner,
    armies,
    turn: "s0",
    first: "s0",
    round: 2,
    step: "attack",
    ...extra,
  };
}

test("the map: 42 territories on six continents, and every border runs both ways", () => {
  assert.equal(TERRITORY_IDS.length, 42);
  const sizes = Object.fromEntries(CONTINENT_IDS.map((c) => [c, territoriesIn(c).length]));
  assert.deepEqual(sizes, { na: 9, sa: 4, eu: 7, af: 6, as: 12, oc: 4 });
  for (const t of TERRITORY_IDS) {
    for (const n of NEIGHBORS[t]) assert.ok(NEIGHBORS[n].includes(t), `${t} -> ${n}`);
    assert.ok(NEIGHBORS[t].length > 0);
  }
  assert.equal(new Set(EDGES.map(([a, b]) => [a, b].sort().join("|"))).size, EDGES.length, "a border listed twice");
  // Everything reachable from Brazil.
  const seen = new Set<Territory>(["brazil"]);
  const queue: Territory[] = ["brazil"];
  while (queue.length) {
    for (const n of NEIGHBORS[queue.shift() as Territory]) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  assert.equal(seen.size, 42);
  assert.ok(NEIGHBORS.alaska.includes("vladivostok"));
  assert.ok(NEIGHBORS.brazil.includes("algeria"));
  assert.equal(Object.values(CONTINENTS).reduce((s, c) => s + c.bonus, 0), 24);
});

test("dealing: every territory to someone with one army, and whoever follows the last card starts", () => {
  for (const n of [3, 4, 5, 6]) {
    const chairs = Array.from({ length: n }, (_, i) => `s${i}`);
    const { state, objectives } = startGame(emptyWar(n), chairs, first);
    assert.equal(TERRITORY_IDS.filter((t) => state.owner[t]).length, 42);
    assert.ok(TERRITORY_IDS.every((t) => state.armies[t] === 1));
    const counts = chairs.map((c) => TERRITORY_IDS.filter((t) => state.owner[t] === c).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.equal(state.turn, chairs[42 % n]);
    assert.equal(state.round, 1);
    // Colours nobody plays take their card out: 8 plus one per player.
    assert.equal(objectives.length, 8 + n);
  }
  assert.deepEqual(objectivesFor(["blue", "red", "green"]).filter((o) => o.startsWith("kill")), ["kill-blue", "kill-red", "kill-green"]);
});

test("reinforcements: half the territories, three at least, and every continent held", () => {
  const few = board({ brazil: ["s0", 1], peru: ["s0", 1] });
  assert.deepEqual(reinforcements(few, "s0"), { free: 3, continent: {} });
  const own: Partial<Record<Territory, [string, number]>> = {};
  for (const t of [...territoriesIn("sa"), ...territoriesIn("oc"), "egypt", "sudan", "congo", "china", "india", "japan", "germany", "poland", "iceland", "england", "sweden"] as Territory[]) own[t] = ["s0", 1];
  const state = board(own);
  assert.deepEqual(reinforcements(state, "s0"), { free: 9, continent: { sa: 2, oc: 2 } });
});

test("placing: the whole reserve, on your own land, continent bonuses at home", () => {
  const own: Partial<Record<Territory, [string, number]>> = { germany: ["s0", 1] };
  for (const t of territoriesIn("sa")) own[t] = ["s0", 1];
  const state = board(own, { step: "place", reserve: { free: 3, continent: { sa: 2 } } });
  assert.match(placementProblem(state, { germany: 5 }) ?? "", /South America/);
  assert.match(placementProblem(state, { germany: 2, brazil: 2 }) ?? "", /1 still/);
  assert.match(placementProblem(state, { alaska: 5 }) ?? "", /not yours/);
  assert.equal(placementProblem(state, { germany: 3, brazil: 2 }), null);
  assert.equal(placementProblem(state, { brazil: 5 }), null, "free armies can go in the continent too");
  // Bonus armies fill their continent first.
  assert.deepEqual(stillToPlace(state, { brazil: 1 }), { free: 3, continent: { sa: 1 } });
  assert.equal(canPlaceOn(state, { germany: 3 }, "germany"), false);
  assert.equal(canPlaceOn(state, { germany: 3 }, "peru"), true);
  const placed = place(state, { germany: 3, brazil: 2 });
  assert.equal(placed.armies.germany, 4);
  assert.equal(placed.armies.brazil, 3);
  assert.equal(placed.step, "attack");
});

test("the first round is only placing, and the round goes up when it comes back round", () => {
  const { state } = startGame(emptyWar(3), ["s0", "s1", "s2"], first);
  assert.equal(state.turn, "s0");
  let s = state;
  for (const chair of ["s0", "s1", "s2"]) {
    assert.equal(s.turn, chair);
    const mine = TERRITORY_IDS.find((t) => s.owner[t] === chair) as Territory;
    s = place(s, { [mine]: s.reserve.free });
  }
  assert.equal(s.turn, "s0");
  assert.equal(s.round, 2);
  assert.equal(s.step, "place");
  assert.equal(attack(s, "brazil", "peru", 3, first), s, "no attacks while placing");
});

test("cards: three alike or three different, jokers wild, worth more with every trade in the game", () => {
  // Shapes go square, circle, triangle round the list: alaska, mackenzie, greenland.
  assert.ok(validSet(["alaska", "mackenzie", "greenland"]));
  assert.ok(validSet(["alaska", "vancouver", "california"]), "all squares");
  assert.equal(validSet(["alaska", "vancouver", "mackenzie"]), false);
  assert.ok(validSet(["alaska", "vancouver", "joker-1"]));
  assert.ok(validSet(["alaska", "joker-1", "joker-2"]));
  assert.equal(validSet(["alaska", "alaska", "vancouver"]), false);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(tradeValue), [4, 6, 8, 10, 12, 15, 20, 25]);
  assert.equal(DECK.length, 44);
});

test("a trade adds the going rate, and two on each pictured territory you hold", () => {
  const state = board({ alaska: ["s0", 1] }, { step: "place", reserve: { free: 3, continent: {} }, trades: 2 });
  const next = trade(state, ["alaska", "mackenzie", "greenland"]);
  assert.equal(next.reserve.free, 3 + 8);
  assert.equal(next.armies.alaska, 3);
  assert.equal(next.armies.mackenzie, 1, "not yours, no extra");
  assert.equal(next.trades, 3);
  assert.equal(trade(state, ["alaska", "vancouver", "mackenzie"]), state);
});

test("the battle: highest against highest, and a tie goes to the defence", () => {
  assert.deepEqual(fight([5, 4, 1], [6, 3, 1]), [2, 1]);
  assert.deepEqual(fight([3, 2], [6]), [1, 0]);
  assert.deepEqual(fight([6, 3, 2], [4, 2, 1]), [0, 3]);
});

test("an attack needs two armies and a neighbour, and a win marches in", () => {
  const state = board({ brazil: ["s0", 4], argentina: ["s1", 1], peru: ["s1", 3] });
  assert.equal(attack(state, "brazil", "sudan", 3, first), state, "not a neighbour");
  // 6 6 6 against a 1: Argentina falls.
  const won = attack(state, "brazil", "argentina", 3, loaded(6, 6, 6, 1));
  assert.equal(won.owner.argentina, "s0");
  assert.equal(won.step, "occupy");
  assert.deepEqual(won.occupy, { from: "brazil", to: "argentina", max: 3 });
  assert.equal(won.conquered, true);
  const moved = occupy(won, 2);
  assert.equal(moved.armies.brazil, 2);
  assert.equal(moved.armies.argentina, 2);
  assert.equal(moved.step, "attack");
  // 1 1 1 against 6 6 6: the defence holds.
  const lost = attack(state, "brazil", "peru", 3, loaded(1, 1, 1, 6, 6, 6));
  assert.equal(lost.armies.brazil, 1);
  assert.equal(lost.armies.peru, 3);
  assert.equal(lost.owner.peru, "s1");
});

test("all in keeps throwing until the land falls or only the occupying army is left", () => {
  const state = board({ brazil: ["s0", 10], peru: ["s1", 4] });
  const held = attack(state, "brazil", "peru", 3, loaded(1), undefined, true);
  assert.equal(held.armies.brazil, 1);
  assert.equal(held.owner.peru, "s1");
  assert.ok(held.battle && held.battle.throws > 1);
  const taken = attack(state, "brazil", "peru", 3, loaded(6, 6, 6, 1, 1, 1), undefined, true);
  assert.equal(taken.owner.peru, "s0");
});

test("taking the last territory knocks a player out, and the cards they held follow", () => {
  const state = board({ brazil: ["s0", 3], argentina: ["s2", 1] });
  const next = attack(state, "brazil", "argentina", 2, loaded(6, 6, 1));
  assert.deepEqual(next.out, ["s2"]);
  assert.equal(next.killedBy.s2, "s0");
  assert.deepEqual(inheritance(2, 2), { take: 2, discard: 0 });
  assert.deepEqual(inheritance(4, 3), { take: 1, discard: 2 });
  assert.deepEqual(inheritance(5, 3), { take: 0, discard: 3 });
  // The turn skips them from now on.
  const after = endTurn(stopAttacking(occupy(next, 1)));
  assert.equal(after.turn, "s1");
  assert.equal(endTurn(after).turn, "s0");
});

test("moving: to your own neighbours, never the last army, and only once", () => {
  const state = board({ brazil: ["s0", 4], peru: ["s0", 1], argentina: ["s0", 1] }, { step: "move" });
  assert.equal(movable(state, "brazil"), 3);
  const one = moveArmies(state, "brazil", "peru", 3);
  assert.equal(one.armies.peru, 4);
  assert.equal(movable(one, "peru"), 1, "the ones that just arrived stay; the one already there may go");
  assert.equal(moveArmies(one, "peru", "argentina", 3).armies.argentina, 2);
  assert.equal(moveArmies(state, "brazil", "algeria", 1), state, "not yours");
  assert.equal(moveArmies(state, "brazil", "mexico", 1), state, "not a neighbour");
});

test("objectives", () => {
  const own: Partial<Record<Territory, [string, number]>> = {};
  for (const t of [...territoriesIn("eu"), ...territoriesIn("oc")]) own[t] = ["s0", 1];
  const eo = board(own);
  assert.equal(objectiveMet(eo, "s0", "eu-oc-any"), false, "needs a third continent");
  for (const t of territoriesIn("sa")) own[t] = ["s0", 1];
  assert.equal(objectiveMet(board(own), "s0", "eu-oc-any"), true);
  assert.equal(objectiveMet(board(own), "s0", "eu-sa-any"), true);
  assert.equal(objectiveMet(board(own), "s0", "as-sa"), false);

  const many: Partial<Record<Territory, [string, number]>> = {};
  TERRITORY_IDS.slice(0, 24).forEach((t) => (many[t] = ["s0", 1]));
  assert.equal(objectiveMet(board(many), "s0", "t24"), true);
  assert.equal(objectiveMet(board(many), "s0", "t18"), false, "one army each is not enough");
  TERRITORY_IDS.slice(0, 18).forEach((t) => (many[t] = ["s0", 2]));
  assert.equal(objectiveMet(board(many), "s0", "t18"), true);

  // Destroying a colour: yours if you did it; 24 territories if not.
  const killed = board({ brazil: ["s0", 2] }, { out: ["s2"], killedBy: { s2: "s0" } });
  assert.equal(objectiveMet(killed, "s0", "kill-green"), true);
  const stolen = board({ brazil: ["s0", 2] }, { out: ["s2"], killedBy: { s2: "s1" } });
  assert.equal(objectiveMet(stolen, "s0", "kill-green"), false);
  assert.equal(objectiveMet(board(many, { out: ["s2"], killedBy: { s2: "s1" } }), "s0", "kill-green"), true);
  assert.equal(objectiveMet(board(many), "s0", "kill-blue"), true, "your own colour means 24");
  assert.equal(objectiveMet(board({}), "s1", "kill-green"), false);

  const over = claimWin(killed, "s0");
  assert.equal(over.phase, "over");
  assert.equal(over.wins.s0, 1);
  assert.equal(lastStanding(board({}, { out: ["s0", "s2"] })), "s1");
});

test("every territory has a place on the board", () => {
  for (const t of TERRITORY_IDS) {
    const { x, y } = TERRITORIES[t];
    assert.ok(x > 0 && x < 1000 && y > 0 && y < 560, t);
  }
});

let db: PGlite;

before(async () => {
  db = await freshDatabase();
});

test("cards are drawn blind into your hand, traded in the open, and taken from the fallen", async () => {
  const [a, b] = await Promise.all([newUser(db), newUser(db)]);
  const { itemId } = await tableFor(db, a, "war");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  await run(a, "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([{ slot: DECK_PILE, cards: DECK, shuffle: true }]),
  ]);
  // Each draws three: nobody sees what anyone else was given.
  for (const [user, chair] of [[a, "s0"], [b, "s1"]] as const) {
    await run(user, "select public.pile_move(p_item => $1, p_from => $2, p_to => $3, p_count => 3, p_to_owner => $4)", [itemId, DECK_PILE, handSlot(chair), user]);
  }
  const { rows: mine } = await run(a, "select slot, cards from public.secrets where item_id = $1", [itemId]);
  assert.deepEqual((mine as Array<{ slot: string }>).map((r) => r.slot), [handSlot("s0")]);
  const hand = (mine as Array<{ cards: string[] }>)[0].cards;

  // Trading: those exact cards, out of your own hand, onto the discards.
  await run(a, "select public.pile_move(p_item => $1, p_from => $2, p_to => $3, p_cards => $4::jsonb)", [itemId, handSlot("s0"), DISCARD_PILE, JSON.stringify(hand)]);
  await assert.rejects(
    run(b, "select public.pile_move(p_item => $1, p_from => $2, p_to => $3, p_cards => $4::jsonb)", [itemId, handSlot("s0"), DISCARD_PILE, JSON.stringify(hand)]),
  );

  // s1 falls to s0: their cards come over blind.
  await run(a, "select public.pile_move(p_item => $1, p_from => $2, p_to => $3, p_count => 3, p_random => true)", [itemId, handSlot("s1"), handSlot("s0")]);
  const { rows: after } = await run(a, "select cards from public.secrets where item_id = $1 and slot = $2", [itemId, handSlot("s0")]);
  assert.equal((after as Array<{ cards: string[] }>)[0].cards.length, 3);
  const { rows: meta } = await db.query<{ data: { state: { piles: Record<string, { size: number }> } } }>("select data from public.items where id = $1", [itemId]);
  assert.equal(meta[0].data.state.piles[handSlot("s1")].size, 0);
  assert.equal(meta[0].data.state.piles[DISCARD_PILE].size, 3);
  assert.equal(meta[0].data.state.piles[DECK_PILE].size, 38);
});
