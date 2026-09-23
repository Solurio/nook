import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD,
  JAIL,
  answerTrade,
  bid,
  build,
  buildProblem,
  buy,
  decline,
  emptyMonopoly,
  endTurn,
  goBroke,
  leaveAuction,
  mortgage,
  payOut,
  propose,
  rentFor,
  roll,
  sellHouse,
  startGame,
  transfer,
  unmortgage,
  useFreeCard,
  type Chair,
  type MonopolyState,
} from "../src/lib/monopoly.ts";

const names = (c: Chair) => ({ p0: "ana", p1: "bo", p2: "cy" })[c as "p0"] ?? c;

/** Dice that come up as asked, one die at a time; anything after that is a 1. */
function dice(...faces: number[]) {
  const queue = faces.map((f) => (f - 1) / 6 + 0.01);
  return () => queue.shift() ?? 0.01;
}

const begin = (chairs: Chair[] = ["p0", "p1"]) => startGame(emptyMonopoly(), chairs, names, () => 0.5);

/** A game with some streets already bought. */
function owning(state: MonopolyState, c: Chair, squares: number[], houses = 0): MonopolyState {
  const deeds = { ...state.deeds };
  for (const at of squares) deeds[String(at)] = { by: c, houses, mortgaged: false };
  return { ...state, deeds };
}

test("everyone starts on GO with $1,500 and the first chair goes first", () => {
  const state = begin(["p0", "p1", "p2"]);
  assert.equal(state.phase, "roll");
  assert.equal(state.turn, "p0");
  for (const c of ["p0", "p1", "p2"]) {
    assert.equal(state.players[c].cash, 1500);
    assert.equal(state.players[c].at, 0);
  }
  assert.equal(state.chance.length, 16);
  assert.equal(state.chest.length, 16);
  assert.equal(startGame(emptyMonopoly(), ["p0"], names).phase, "setup", "one player is not a game");
});

test("a throw moves you on, and an unowned street offers itself", () => {
  const state = roll(begin(), names, dice(2, 1));
  assert.equal(state.players.p0.at, 3, "Baltic Avenue");
  assert.deepEqual(state.pending, { kind: "buy", at: 3 });
  const bought = buy(state, names);
  assert.equal(bought.players.p0.cash, 1440);
  assert.equal(bought.deeds["3"].by, "p0");
  assert.equal(bought.phase, "moved");
  assert.equal(endTurn(bought).turn, "p1");
});

test("passing GO pays $200", () => {
  let state = begin();
  state = { ...state, players: { ...state.players, p0: { ...state.players.p0, at: 38 } } };
  const next = roll(state, names, dice(1, 2));
  assert.equal(next.players.p0.at, 1);
  assert.equal(next.players.p0.cash, 1700);
});

test("rent: plain, doubled for the whole set, then by the houses", () => {
  const state = owning(begin(), "p1", [1]);
  assert.equal(rentFor(state, 1, 7), 2);
  const set = owning(state, "p1", [1, 3]);
  assert.equal(rentFor(set, 1, 7), 4, "an unbuilt set pays double");
  const built = owning(set, "p1", [1], 3);
  assert.equal(rentFor(built, 1, 7), 90);
  const hotel = owning(set, "p1", [39, 37], 5);
  assert.equal(rentFor(hotel, 39, 7), 2000);
  const mortgaged = { ...state, deeds: { ...state.deeds, "1": { by: "p1" as Chair, houses: 0, mortgaged: true } } };
  assert.equal(rentFor(mortgaged, 1, 7), 0, "a mortgaged street pays nothing");
});

test("railroads pay by how many are held, utilities by the dice", () => {
  const one = owning(begin(), "p1", [5]);
  assert.equal(rentFor(one, 5, 7), 25);
  const four = owning(begin(), "p1", [5, 15, 25, 35]);
  assert.equal(rentFor(four, 5, 7), 200);
  const util = owning(begin(), "p1", [12]);
  assert.equal(rentFor(util, 12, 7), 28);
  assert.equal(rentFor(owning(util, "p1", [28]), 12, 7), 70);
});

test("landing on someone's street pays them", () => {
  const state = owning(begin(), "p1", [3]);
  const next = roll(state, names, dice(2, 1));
  assert.equal(next.players.p0.cash, 1496);
  assert.equal(next.players.p1.cash, 1504);
  assert.equal(next.pending, null);
});

test("a double throws again; three in a row is jail", () => {
  const once = roll(begin(), names, dice(3, 3));
  assert.equal(once.phase, "roll", "a double throws again");
  assert.equal(once.doubles, 1);
  const cleared = once.pending ? decline(once, names) : once;
  let state: MonopolyState = { ...cleared, pending: null };
  state = roll(state, names, dice(2, 2));
  state = { ...state, pending: null };
  state = roll(state, names, dice(1, 1));
  assert.equal(state.players.p0.at, JAIL);
  assert.equal(state.players.p0.jailed, true);
  assert.equal(state.phase, "moved");
});

test("jail: pay, use a card, or throw for a double -- and the third miss pays anyway", () => {
  let state = begin();
  state = { ...state, players: { ...state.players, p0: { ...state.players.p0, at: JAIL, jailed: true, free: ["chance"] } } };
  assert.equal(payOut(state, names).players.p0.jailed, false);
  assert.equal(payOut(state, names).players.p0.cash, 1450);
  const card = useFreeCard(state, names);
  assert.equal(card.players.p0.jailed, false);
  assert.deepEqual(card.players.p0.free, []);
  const stuck = roll(state, names, dice(1, 2));
  assert.equal(stuck.players.p0.jailed, true, "no double, still inside");
  assert.equal(stuck.players.p0.jailTurns, 1);
  const third = roll({ ...state, players: { ...state.players, p0: { ...state.players.p0, jailTurns: 2 } } }, names, dice(1, 2));
  assert.equal(third.players.p0.jailed, false);
  assert.equal(third.players.p0.at, JAIL + 3);
  assert.equal(third.players.p0.cash, 1450);
});

test("houses go on whole sets only, and evenly", () => {
  const partial = owning(begin(), "p0", [1]);
  assert.match(buildProblem(partial, "p0", 1) ?? "", /whole colour set/);
  let state = owning(begin(), "p0", [1, 3]);
  state = build(state, "p0", 1, names);
  assert.equal(state.deeds["1"].houses, 1);
  assert.equal(state.players.p0.cash, 1450);
  assert.match(buildProblem(state, "p0", 1) ?? "", /evenly/);
  state = build(state, "p0", 3, names);
  assert.equal(buildProblem(state, "p0", 1), null);
  const sold = sellHouse(state, "p0", 1, names);
  assert.equal(sold.deeds["1"].houses, 0);
  assert.equal(sold.players.p0.cash, state.players.p0.cash + 25, "a house sells back for half");
});

test("a mortgage raises half the price, and costs ten per cent more to lift", () => {
  const state = owning(begin(), "p0", [39]);
  const down = mortgage(state, "p0", 39, names);
  assert.equal(down.players.p0.cash, 1700);
  assert.equal(down.deeds["39"].mortgaged, true);
  const up = unmortgage(down, "p0", 39, names);
  assert.equal(up.players.p0.cash, 1700 - 220);
  assert.equal(up.deeds["39"].mortgaged, false);
});

test("a street nobody buys goes to auction and to the highest bidder", () => {
  let state = roll(begin(["p0", "p1", "p2"]), names, dice(2, 1));
  state = decline(state, names);
  assert.equal(state.pending?.kind, "auction");
  state = bid(state, "p1", 20);
  state = bid(state, "p2", 15);
  assert.equal(state.pending?.kind === "auction" && state.pending.by, "p1", "a lower bid does not count");
  state = bid(state, "p2", 40);
  state = leaveAuction(state, "p0", names);
  state = leaveAuction(state, "p1", names);
  assert.equal(state.pending, null, "one bidder left closes it");
  assert.equal(state.deeds["3"].by, "p2");
  assert.equal(state.players.p2.cash, 1460);
});

test("owing more than you have: raise it, or go broke to whoever you owe", () => {
  let state = owning(begin(["p0", "p1", "p2"]), "p0", [39]);
  state = { ...state, players: { ...state.players, p0: { ...state.players.p0, cash: 100 } } };
  state = transfer(state, "p0", "p1", 300);
  assert.deepEqual(state.pending, { kind: "debt", who: "p0", to: "p1" });
  const raised = mortgage(state, "p0", 39, names);
  assert.equal(raised.pending, null, "the mortgage covered it");
  const broke = goBroke(state, "p0", names);
  assert.equal(broke.players.p0.bankrupt, true);
  assert.equal(broke.deeds["39"].by, "p1", "the creditor takes the streets");
  assert.equal(broke.players.p1.cash, 1500 + 300 - 200, "and what was really there to pay");
  const last = goBroke({ ...broke, pending: null }, "p2", names);
  assert.equal(last.winner, "p1");
  assert.equal(last.phase, "over");
});

test("a trade swaps streets and cash, if the other side agrees", () => {
  let state = owning(owning(begin(), "p0", [1]), "p1", [3]);
  state = propose(state, { from: "p0", to: "p1", give: { cash: 50, squares: [1], free: 0 }, get: { cash: 0, squares: [3], free: 0 } });
  assert.ok(state.trade);
  const done = answerTrade(state, true, names);
  assert.equal(done.deeds["1"].by, "p1");
  assert.equal(done.deeds["3"].by, "p0");
  assert.equal(done.players.p0.cash, 1450);
  assert.equal(answerTrade(state, false, names).deeds["1"].by, "p0");
  assert.equal(BOARD.length, 40);
});
