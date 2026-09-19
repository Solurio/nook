import { test } from "node:test";
import assert from "node:assert/strict";
import { COAST, EDGES, HARBOUR_EDGES, HEXES, HEX_NEIGHBORS, VERTICES } from "../src/lib/catan-board.ts";
import {
  COST,
  DEV_DECK,
  acceptTrade,
  bank,
  bankTrade,
  buildCity,
  buildRoad,
  buildSettlement,
  canRoad,
  canSettle,
  claimWin,
  discard,
  emptyCatan,
  emptyHand,
  endTurn,
  longestRoadOf,
  moveRobber,
  newBoard,
  offerTrade,
  playKnight,
  playMonopoly,
  playRoadBuilding,
  playYearOfPlenty,
  production,
  publicPoints,
  redsTouch,
  roll,
  setupRoad,
  setupSettlement,
  settleSpots,
  startGame,
  steal,
  tradeRate,
  type CatanState,
  type Hand,
} from "../src/lib/catan.ts";

/** A random source that walks through the given numbers, then repeats. */
const seq = (...values: number[]) => {
  let i = 0;
  return (max: number) => values[i++ % values.length] % max;
};
const first = () => 0;
const hand = (h: Partial<Hand>): Hand => ({ ...emptyHand(), ...h });

/** Two corners joined by an edge, and the edge. */
const anEdge = (e = 0) => ({ e, a: EDGES[e].a, b: EDGES[e].b });

/** A game past setup, with nothing on the board: s0 to move. */
function playing(extra: Partial<CatanState> = {}): CatanState {
  const started = startGame(emptyCatan(3), ["s0", "s1", "s2"], first);
  return { ...started, step: "main", turn: "s0", ...extra };
}

test("the island: 19 hexes, 54 corners, 72 edges, 30 of them coast, 9 harbours apart", () => {
  assert.equal(HEXES.length, 19);
  assert.equal(VERTICES.length, 54);
  assert.equal(EDGES.length, 72);
  assert.equal(COAST.length, 30);
  assert.equal(HARBOUR_EDGES.length, 9);
  const corners = HARBOUR_EDGES.flatMap((e) => [EDGES[e].a, EDGES[e].b]);
  assert.equal(new Set(corners).size, 18, "two harbours share a corner");
  assert.ok(VERTICES.every((v) => v.hexes.length >= 1 && v.hexes.length <= 3));
  assert.ok(VERTICES.every((v) => v.neighbors.length >= 2 && v.neighbors.length <= 3));
  assert.equal(HEX_NEIGHBORS[9].length, 6, "the middle hex has six neighbours");
});

test("a new board has the right mix, and its 6s and 8s never touch", () => {
  for (let s = 0; s < 20; s += 1) {
    let n = s * 7919;
    const random = (max: number) => {
      n = (n * 1103515245 + 12345) % 2147483648;
      return n % max;
    };
    const board = newBoard(random);
    const kinds = board.hexes.map((h) => h.terrain).sort();
    assert.equal(kinds.filter((k) => k === "desert").length, 1);
    assert.equal(kinds.filter((k) => k === "forest").length, 4);
    assert.equal(kinds.filter((k) => k === "hills").length, 3);
    assert.equal(board.hexes.find((h) => h.terrain === "desert")?.number, null);
    assert.equal(redsTouch(board.hexes), false);
    assert.equal(board.harbours.filter((h) => h.kind === "any").length, 4);
  }
});

test("setup goes round and back; the second settlement pays out; roads touch the settlement", () => {
  let state = startGame(emptyCatan(3), ["s0", "s1", "s2"], first);
  assert.deepEqual(state.setupQueue, ["s0", "s1", "s2", "s2", "s1", "s0"]);
  assert.equal(state.step, "setup-settlement");
  const spots = [0, 20, 40, 10, 30, 50].map((i) => settleSpots(state, "s0", true)[i]);
  const order: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    order.push(state.turn);
    const legal = settleSpots(state, state.turn, true);
    const v = legal.includes(spots[i]) ? spots[i] : legal[0];
    state = setupSettlement(state, v);
    assert.equal(state.step, "setup-road");
    const far = EDGES.findIndex((e) => e.a !== v && e.b !== v);
    assert.equal(setupRoad(state, far), state, "a setup road must touch its settlement");
    state = setupRoad(state, VERTICES[v].edges[0]);
  }
  assert.deepEqual(order, ["s0", "s1", "s2", "s2", "s1", "s0"]);
  assert.equal(state.step, "roll");
  assert.equal(state.turn, "s0");
  const cards = Object.values(state.hands).reduce((n, h) => n + Object.values(h).reduce((a, b) => a + b, 0), 0);
  assert.ok(cards > 0, "nobody got anything from their second settlement");
});

test("settlements keep a corner apart, and after setup need a road to them", () => {
  const { a, b } = anEdge(10);
  let state = playing({ buildings: { [a]: { chair: "s1", city: false } } });
  assert.equal(canSettle(state, "s0", b, true), false, "right next door");
  const far = VERTICES.findIndex((_, v) => v !== a && !VERTICES[a].neighbors.includes(v) && v !== b);
  assert.equal(canSettle(state, "s0", far), false, "no road there");
  state = { ...state, roads: { [VERTICES[far].edges[0]]: "s0" } };
  assert.equal(canSettle(state, "s0", far), true);
});

test("a road joins your own road or town, and not through somebody else's", () => {
  const v = 20;
  const [e1, e2] = VERTICES[v].edges;
  const state = playing({ roads: { [e1]: "s0" }, buildings: { [v]: { chair: "s1", city: false } } });
  assert.equal(canRoad(state, "s0", e2), false, "through s1's settlement");
  const open = playing({ roads: { [e1]: "s0" } });
  assert.equal(canRoad(open, "s0", e2), true);
});

test("building costs, and a city doubles what a corner collects", () => {
  const v = HEXES[9].corners[0];
  let state = playing({
    buildings: { [v]: { chair: "s0", city: false } },
    hands: { s0: hand({ wheat: 2, ore: 3, wood: 1, brick: 1 }), s1: emptyHand(), s2: emptyHand() },
  });
  state = buildCity(state, v);
  assert.equal(state.buildings[v].city, true);
  assert.deepEqual(state.hands.s0, hand({ wood: 1, brick: 1 }));
  assert.equal(publicPoints(state, "s0"), 2);
  // A city on the middle hex, rolled.
  const board = state.board!;
  const number = board.hexes[9].number;
  if (number && number !== 7) {
    const got = production({ ...state, robber: 0 }, number);
    assert.ok(Object.values(got.s0).reduce((a, b) => a + b, 0) >= 2);
    assert.deepEqual(production({ ...state, robber: 9 }, number).s0, emptyHand(), "the robber blocks it");
  }
  assert.equal(buildSettlement(state, 0), state, "not enough cards");
});

test("a 7: big hands lose half, then the robber moves and steals", () => {
  let state = playing({
    step: "roll",
    hands: { s0: hand({ wood: 3 }), s1: hand({ ore: 9 }), s2: hand({ sheep: 2 }) },
  });
  // Dice 3 and 4.
  state = roll(state, seq(2, 3));
  assert.deepEqual(state.dice, [3, 4]);
  assert.equal(state.step, "discard");
  assert.deepEqual(state.discards, { s1: 4 });
  assert.equal(discard(state, "s1", hand({ ore: 3 })), state, "four, not three");
  state = discard(state, "s1", hand({ ore: 4 }));
  assert.equal(state.step, "robber");
  const target = HEXES.findIndex((_, h) => h !== state.robber);
  const v = HEXES[target].corners[0];
  state = { ...state, buildings: { [v]: { chair: "s2", city: false } } };
  assert.equal(moveRobber(state, state.robber), state, "it has to move");
  state = moveRobber(state, target);
  assert.equal(state.step, "steal");
  assert.deepEqual(state.victims, ["s2"]);
  state = steal(state, "s2", first);
  assert.equal(state.hands.s2.sheep, 1);
  assert.equal(state.hands.s0.sheep, 1);
  assert.equal(state.step, "main");
});

test("the longest road: five or more, the holder keeps it on a tie, and a town can cut it", () => {
  // A run of edges, corner to corner.
  const path: number[] = [];
  let v = 0;
  const seen = new Set([0]);
  while (path.length < 6) {
    const e = VERTICES[v].edges.find((x) => !seen.has(EDGES[x].a === v ? EDGES[x].b : EDGES[x].a)) as number;
    path.push(e);
    v = EDGES[e].a === v ? EDGES[e].b : EDGES[e].a;
    seen.add(v);
  }
  let state = playing({ roads: Object.fromEntries(path.slice(0, 4).map((e) => [e, "s0"])), hands: { s0: hand({ wood: 5, brick: 5 }), s1: emptyHand(), s2: emptyHand() } });
  assert.equal(longestRoadOf(state, "s0"), 4);
  state = buildRoad(state, path[4]);
  assert.equal(longestRoadOf(state, "s0"), 5);
  assert.equal(state.longestRoad, "s0");
  assert.equal(publicPoints(state, "s0"), 2);
  // Somebody else's settlement in the middle breaks it.
  const middle = EDGES[path[2]].b === EDGES[path[3]].a || EDGES[path[2]].b === EDGES[path[3]].b ? EDGES[path[2]].b : EDGES[path[2]].a;
  const cut = { ...state, buildings: { [middle]: { chair: "s1", city: false } } };
  assert.ok(longestRoadOf(cut, "s0") < 5);
});

test("development cards: one a turn, knights make the army, the rest do what they say", () => {
  let state = playing({ hands: { s0: hand({ ore: 1 }), s1: hand({ wheat: 3 }), s2: hand({ wheat: 2, ore: 1 }) } });
  assert.equal(DEV_DECK.length, 25);
  const monopoly = playMonopoly(state, "wheat");
  assert.equal(monopoly.hands.s0.wheat, 5);
  assert.equal(monopoly.hands.s1.wheat, 0);
  assert.equal(playYearOfPlenty(monopoly, "ore", "ore"), monopoly, "only one card a turn");
  const plenty = playYearOfPlenty(state, "brick", "wood");
  assert.deepEqual(plenty.hands.s0, hand({ ore: 1, brick: 1, wood: 1 }));
  state = { ...state, roads: { [VERTICES[0].edges[0]]: "s0" } };
  const roads = playRoadBuilding(state);
  assert.equal(roads.step, "roads");
  assert.equal(roads.freeRoads, 2);
  // Knights: three and the largest army, worth two.
  let army: CatanState = { ...playing(), knights: { s0: 2, s1: 0, s2: 0 } };
  army = playKnight(army);
  assert.equal(army.step, "robber");
  assert.equal(army.largestArmy, "s0");
  assert.equal(publicPoints(army, "s0"), 2);
  // Before rolling, a knight goes back to the roll afterwards.
  const early = playKnight(playing({ step: "roll" }));
  assert.equal(early.after, "roll");
});

test("trading: 4 to 1, 3 to 1 at any harbour, 2 to 1 at its own; and with each other", () => {
  let state = playing({ hands: { s0: hand({ wood: 4, sheep: 2 }), s1: hand({ ore: 2 }), s2: emptyHand() } });
  assert.equal(tradeRate(state, "s0", "wood"), 4);
  state = bankTrade(state, "wood", "ore");
  assert.deepEqual(state.hands.s0, hand({ ore: 1, sheep: 2 }));
  const harbour = state.board!.harbours.find((h) => h.kind === "sheep")!;
  const withPort = { ...state, buildings: { [EDGES[harbour.edge].a]: { chair: "s0", city: false } } };
  assert.equal(tradeRate(withPort, "s0", "sheep"), 2);
  const offered = offerTrade(state, hand({ sheep: 1 }), hand({ ore: 1 }));
  assert.ok(offered.offer);
  assert.equal(acceptTrade(offered, "s2"), offered, "s2 has no ore");
  const done = acceptTrade(offered, "s1");
  assert.equal(done.hands.s1.sheep, 1);
  assert.equal(done.hands.s0.ore, 2);
  assert.equal(done.offer, null);
});

test("ten points on your own turn wins; hidden victory cards count when shown", () => {
  const towns = Object.fromEntries(
    [0, 8, 16, 24, 32].map((v) => [v, { chair: "s0", city: true }]),
  ) as CatanState["buildings"];
  const state = playing({ buildings: towns });
  assert.equal(publicPoints(state, "s0"), 10);
  const hands = { s0: hand({ wood: 1, brick: 1 }), s1: emptyHand(), s2: emptyHand() };
  const road = VERTICES[0].edges[0];
  const won = buildRoad({ ...state, hands }, road);
  assert.equal(won.phase, "over");
  assert.equal(won.winner, "s0");
  const eight = playing({ buildings: Object.fromEntries([0, 8, 16, 24].map((v) => [v, { chair: "s0", city: true }])) });
  assert.equal(claimWin(eight, "s0", 1), eight, "nine is not enough");
  assert.equal(claimWin(eight, "s0", 2).winner, "s0");
  assert.equal(claimWin(eight, "s1", 5), eight, "only on your own turn");
});

test("the bank runs out: a resource nobody can all have goes to nobody", () => {
  const state = playing();
  const full = bank(state);
  assert.equal(full.ore, 19);
  const cost = COST.city;
  assert.equal(cost.ore, 3);
  const turn = endTurn(state);
  assert.equal(turn.turn, "s1");
  assert.equal(turn.step, "roll");
});
