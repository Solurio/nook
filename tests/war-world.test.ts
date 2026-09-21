import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASSIC,
  GREECE,
  addContinent,
  addTerritory,
  connected,
  dealObjectives,
  describeObjective,
  editContinent,
  editTerritory,
  exportWorld,
  importWorld,
  indexOf,
  removeContinent,
  removeTerritory,
  rulesOf,
  suggestBorders,
  suggestObjectives,
  tidyRules,
  toggleBorder,
  worldOf,
  worldProblem,
  emptyWorld,
  DEFAULT_RULES,
} from "../src/lib/war-world.ts";
import { attack, emptyWar, fight, objectiveMet, reinforcements, startGame, validSet, type WarState } from "../src/lib/war.ts";

const first = () => 0;

test("the classic world: 42 territories, six continents, outlines, the official objectives", () => {
  assert.equal(CLASSIC.territories.length, 42);
  assert.equal(CLASSIC.continents.length, 6);
  assert.ok(CLASSIC.territories.filter((t) => t.shape).length >= 40, "the drawn world lost its outlines");
  assert.ok(connected(CLASSIC));
  assert.equal(dealObjectives(CLASSIC, ["blue", "red", "green"], DEFAULT_RULES).length, 8 + 3);
  assert.equal(describeObjective(CLASSIC, "c:as,sa"), "conquer Asia and South America");
});

test("ancient Greece is a world you can play at any size", () => {
  for (const n of [3, 4, 5, 6]) assert.equal(worldProblem(GREECE, n), null);
  const objectives = suggestObjectives(GREECE);
  assert.ok(objectives.some((o) => o.kind === "continents"));
  const codes = dealObjectives(GREECE, ["blue", "red", "green"], DEFAULT_RULES);
  assert.ok(codes.some((c) => /Peloponnese|Hellas|Ionia|Macedonia|Islands|Crete/.test(describeObjective(GREECE, c))), "the objectives name the map's own continents");
});

test("making a world: continents and territories come and go, borders join them", () => {
  let world = emptyWorld("the campaign");
  const added = addContinent(world, "the north");
  world = added.world;
  const north = added.id;
  const ids: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const made = addTerritory(world, i < 3 ? world.continents[0].id : north, 100 + i * 120, 200 + (i % 2) * 60);
    world = made.world;
    ids.push(made.id);
  }
  assert.equal(world.territories.length, 6);
  assert.equal(connected(world), false);
  world = suggestBorders(world);
  assert.ok(connected(world), "the suggested borders left somebody out");
  world = toggleBorder(world, ids[0], ids[5]);
  assert.ok(indexOf(world).neighbors.get(ids[0])?.includes(ids[5]));
  world = toggleBorder(world, ids[5], ids[0]);
  assert.ok(!indexOf(world).neighbors.get(ids[0])?.includes(ids[5]), "a border is the same both ways");
  world = editTerritory(world, ids[0], { name: "Winterhold", x: 5000 });
  assert.equal(world.territories[0].name, "Winterhold");
  assert.equal(world.territories[0].x, 1000, "kept on the board");
  world = editContinent(world, north, { name: "The North", bonus: 7 });
  assert.equal(world.continents.find((c) => c.id === north)?.bonus, 7);
  const moved = removeContinent(world, north, world.continents[0].id);
  assert.equal(moved.territories.length, 6, "its territories moved over");
  const dropped = removeContinent(world, north);
  assert.equal(dropped.territories.length, 3, "its territories went with it");
  assert.ok(dropped.borders.every(([a, b]) => dropped.territories.some((t) => t.id === a) && dropped.territories.some((t) => t.id === b)));
  const less = removeTerritory(world, ids[1]);
  assert.ok(less.borders.every(([a, b]) => a !== ids[1] && b !== ids[1]));
  assert.match(worldProblem(less, 3) ?? "", /at least 6/);
});

test("a game on a made-up world, by the table's own rules", () => {
  const rules = tidyRules({ goal: "conquest", divisor: 3, minimum: 4, attackDice: 2, defendDice: 2, tiesToDefence: false });
  const base: WarState = { ...emptyWar(3), world: GREECE, rules };
  const { state, objectives, deck } = startGame(base, ["s0", "s1", "s2"], first);
  assert.deepEqual(objectives, [], "conquest deals no objectives");
  assert.equal(deck.length, GREECE.territories.length + 2);
  assert.equal(Object.keys(state.owner).length, GREECE.territories.length);
  assert.equal(reinforcements(state, "s0").free, 4, "nine territories over three is three; the minimum is four");
  assert.deepEqual(fight([4, 2], [4, 1], false), [0, 2], "ties to the attacker");
  // Attack along a border of the world being played.
  const owner = { ...state.owner, attica: "s0", corinth: "s1" };
  const armies = { ...state.armies, attica: 5, corinth: 1 };
  const war: WarState = { ...state, owner, armies, turn: "s0", round: 2, step: "attack" };
  const done = attack(war, "attica", "corinth", 3, () => 5);
  assert.equal(done.owner.corinth, "s0");
  assert.equal(done.battle?.attack.length, 2, "two dice at most, by these rules");
  assert.equal(attack(war, "attica", "rhodes", 3, first), war, "not a border");
  assert.ok(validSet(["epirus", "pella", "chalcidice"], GREECE));
});

test("objectives name what the map holds, and are met on it", () => {
  const world = GREECE;
  const ids = world.territories.filter((t) => t.continent === "cre" || t.continent === "isl").map((t) => t.id);
  const owner = Object.fromEntries(world.territories.map((t) => [t.id, ids.includes(t.id) ? "s0" : "s1"]));
  const state: WarState = { ...emptyWar(3), world, phase: "play", order: ["s0", "s1", "s2"], owner, armies: Object.fromEntries(world.territories.map((t) => [t.id, 1])) };
  assert.equal(objectiveMet(state, "s0", "c:cre,isl"), true);
  assert.equal(objectiveMet(state, "s0", "c:cre,isl:+1"), false);
  assert.equal(objectiveMet(state, "s0", "t:6:1"), true);
  assert.equal(objectiveMet(state, "s0", "t:6:2"), false);
});

test("an older room's map still plays, and a world travels as text", () => {
  const legacy = worldOf({ map: { name: "ours", image: null, sea: null, shapes: true, labels: true, links: true, spots: { brazil: { x: 10, y: 20 } }, names: { brazil: "Pindorama" }, customLinks: [["brazil", "japan"]] } } as never);
  const brazil = legacy.territories.find((t) => t.id === "brazil");
  assert.equal(brazil?.name, "Pindorama");
  assert.equal(brazil?.x, 10);
  assert.ok(indexOf(legacy).neighbors.get("brazil")?.includes("japan"));
  const back = importWorld(exportWorld(GREECE, rulesOf({ rules: { jokers: 4 } })));
  assert.equal(back?.world.territories.length, GREECE.territories.length);
  assert.equal(back?.rules?.jokers, 4);
  assert.equal(importWorld("not a map"), null);
});
