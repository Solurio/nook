import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  ARROWS,
  FACES,
  ROLES_PILE,
  SEALED_PILE,
  canReroll,
  emptyBang,
  indians,
  maxRolls,
  resolve,
  roll,
  rolesFor,
  roleSlot,
  sealedSlot,
  seatsBetween,
  sidGives,
  startGame,
  stopRolling,
  takeArrows,
  targetsFor,
  unchosen,
  unmasked,
  winnerOf,
  wound,
  type BangState,
  type Character,
  type Face,
  type Role,
} from "../src/lib/bang.ts";

const name = (c: string) => c;

/** Dice that come up exactly as listed, then repeat. */
const loaded = (...faces: Face[]) => {
  let i = 0;
  return () => FACES.indexOf(faces[i++ % faces.length]);
};

const LIFE: Record<Character, number> = {
  bart: 8, blackjack: 8, calamity: 8, gringo: 7, jesse: 9, jourdonnais: 7, kit: 7, lucky: 8,
  paul: 9, pedro: 8, rose: 9, sid: 8, slab: 8, suzy: 8, vulture: 9, willy: 8,
};

/** A table with chosen characters, s0 the Sheriff, about to roll. Anyone not named is Paul Regret. */
function table(characters: Partial<Record<string, Character>> = {}, n = 5): BangState {
  const chairs = Array.from({ length: n }, (_, i) => `s${i}`);
  const { state } = startGame(emptyBang(n), chairs, () => 0);
  const players = { ...state.players };
  chairs.forEach((c, i) => {
    const character = characters[c] ?? "paul";
    const life = LIFE[character] + (i === 0 ? 2 : 0);
    players[c] = { character, life, max: life, arrows: 0, ...(i === 0 ? { role: "sheriff" as Role } : {}) };
  });
  return { ...state, players, turn: "s0", step: "roll", rolls: 0, dice: [], arrows: ARROWS };
}

const set = (state: BangState, chair: string, patch: Partial<BangState["players"][string]>): BangState => ({
  ...state,
  players: { ...state.players, [chair]: { ...state.players[chair], ...patch } },
});

test("the roles fit the table, from three to eight", () => {
  assert.deepEqual([...rolesFor(3)].sort(), ["deputy", "outlaw", "renegade"]);
  assert.deepEqual([...rolesFor(4)].sort(), ["outlaw", "outlaw", "renegade", "sheriff"]);
  assert.equal(rolesFor(8).filter((r) => r === "renegade").length, 2);
  assert.equal(rolesFor(8).length, 8);
});

test("the Sheriff has two more bullets, and starts", () => {
  const { state, sheriff, hidden } = startGame(emptyBang(5), ["s0", "s1", "s2", "s3", "s4"], () => 1);
  assert.equal(state.turn, sheriff);
  const p = state.players[sheriff as string];
  assert.equal(p.max, LIFE[p.character] + 2);
  assert.equal(hidden.length, 4);
  assert.equal(hidden.includes("sheriff"), false);
});

test("at three the roles are face up and the Deputy starts", () => {
  const { state, sheriff, hidden } = startGame(emptyBang(3), ["s0", "s1", "s2"], () => 0);
  assert.equal(sheriff, null);
  assert.deepEqual(hidden, []);
  assert.equal(state.three, true);
  assert.equal(state.players[state.turn].role, "deputy");
  for (const c of state.order) assert.ok(state.players[c].role);
});

test("the first roll throws all five, then up to two more", () => {
  let state = roll(table(), [], loaded("one", "two", "beer", "gatling", "one"), name);
  assert.equal(state.dice.length, 5);
  assert.deepEqual(state.roll?.thrown, [0, 1, 2, 3, 4]);
  state = roll(state, [0, 1], loaded("beer"), name);
  assert.deepEqual(state.roll?.thrown, [0, 1]);
  assert.equal(state.dice[0], "beer");
  state = roll(state, [2], loaded("two"), name);
  assert.equal(state.rolls, 3);
  assert.equal(state.step, "resolve", "out of rolls");
  assert.equal(roll(state, [3], loaded("one"), name), state);
});

test("Lucky Duke rolls four times", () => {
  assert.equal(maxRolls(table({ s0: "lucky" })), 4);
});

test("dynamite stays put, unless you are Black Jack", () => {
  const state = roll(table(), [], loaded("dynamite", "one", "one", "one", "one"), name);
  assert.equal(canReroll(state, 0), false);
  assert.equal(canReroll(state, 1), true);
  const jack = roll(table({ s0: "blackjack" }), [], loaded("dynamite", "one", "one", "one", "one"), name);
  assert.equal(canReroll(jack, 0), true);
});

test("three dynamite ends the rolling and costs a life, and the rest still count", () => {
  let state = roll(table(), [], loaded("dynamite", "dynamite", "dynamite", "one", "beer"), name);
  assert.equal(state.exploded, true);
  assert.equal(state.step, "resolve");
  const before = state.players.s1.life;
  state = resolve(state, { shots: { 3: "s1" }, beers: { 4: "s0" } }, name);
  assert.equal(state.players.s0.life, 11, "a life lost, and a beer back");
  assert.equal(state.players.s1.life, before - 1);
  assert.equal(state.turn, "s1");
});

test("arrows are taken as they land; the last one brings the Indians", () => {
  let state = set({ ...table(), arrows: 2 }, "s2", { arrows: 3 });
  state = roll(state, [], loaded("arrow", "arrow", "arrow", "one", "one"), name);
  // The second arrow empties the middle: the Indians attack, then the third is taken.
  assert.equal(state.players.s2.life, 9 - 3);
  assert.equal(state.players.s0.life, 11 - 2);
  assert.equal(state.players.s0.arrows, 1);
  assert.equal(state.arrows, ARROWS - 1);
});

test("Jourdonnais never loses more than one to the Indians", () => {
  const state = indians(set(table({ s1: "jourdonnais" }), "s1", { arrows: 4 }), name);
  assert.equal(state.players.s1.life, state.players.s1.max - 1);
});

test("bull's eyes reach one and two places, and a 2 is a 1 with three left", () => {
  const state = table();
  assert.deepEqual(targetsFor(state, "s0", "one").sort(), ["s1", "s4"]);
  assert.deepEqual(targetsFor(state, "s0", "two").sort(), ["s2", "s3"]);
  const three = set(set(state, "s1", { dead: true }), "s2", { dead: true });
  assert.deepEqual(targetsFor(three, "s0", "two").sort(), ["s3", "s4"]);
  assert.equal(seatsBetween(three, "s0", "s3"), 1, "the dead are not counted");
});

test("Calamity Janet uses either, and Rose Doolan reaches further", () => {
  assert.deepEqual(targetsFor(table({ s0: "calamity" }), "s0", "one").sort(), ["s1", "s2", "s3", "s4"]);
  const rose = table({ s0: "rose" }, 7);
  assert.deepEqual(targetsFor(rose, "s0", "one").sort(), ["s1", "s2", "s5", "s6"]);
  assert.deepEqual(targetsFor(rose, "s0", "two").sort(), ["s2", "s3", "s4", "s5"]);
});

test("every bull's eye and beer needs someone chosen", () => {
  const state = stopRolling(roll(table(), [], loaded("one", "beer", "arrow", "gatling", "dynamite"), name));
  assert.deepEqual(unchosen(state, { shots: {}, beers: {} }), [0, 1]);
  assert.deepEqual(unchosen(state, { shots: { 0: "s1" }, beers: { 1: "s0" } }), []);
});

test("three Gatlings hit everyone else and drop your arrows; Paul Regret shrugs it off", () => {
  let state = roll({ ...table({ s1: "paul", s2: "jesse", s3: "jesse", s4: "jesse" }), arrows: 7 }, [], loaded("gatling", "gatling", "gatling", "arrow", "beer"), name);
  assert.equal(state.players.s0.arrows, 1);
  const lives = Object.fromEntries(state.order.map((c) => [c, state.players[c].life]));
  state = resolve(stopRolling(state), { shots: {}, beers: { 4: "s0" } }, name);
  assert.equal(state.players.s0.arrows, 0);
  assert.equal(state.players.s1.life, lives.s1);
  assert.equal(state.players.s2.life, lives.s2 - 1);
});

test("Willy the Kid needs only two", () => {
  let state = stopRolling(roll(table({ s0: "willy", s1: "jesse" }), [], loaded("gatling", "gatling", "beer", "beer", "beer"), name));
  const before = state.players.s1.life;
  state = resolve(state, { shots: {}, beers: { 2: "s0", 3: "s0", 4: "s0" } }, name);
  assert.equal(state.players.s1.life, before - 1);
});

test("Bart takes arrows instead of wounds, but never the last one", () => {
  let state = set({ ...table({ s1: "bart" }), arrows: 2 }, "s1", { bartArrows: true });
  state = wound(state, "s1", 2, "s0", "shot", name);
  assert.equal(state.players.s1.arrows, 1, "one arrow, leaving the last in the middle");
  assert.equal(state.players.s1.life, state.players.s1.max - 1);
});

test("El Gringo hands whoever hurts him an arrow", () => {
  const state = wound(table({ s1: "gringo" }), "s1", 1, "s0", "shot", name);
  assert.equal(state.players.s0.arrows, 1);
});

test("Pedro drops an arrow for each life he loses", () => {
  let state = set({ ...table({ s1: "pedro" }), arrows: 7 }, "s1", { arrows: 2 });
  state = wound(state, "s1", 1, "s0", "shot", name);
  assert.equal(state.players.s1.arrows, 1);
  assert.equal(state.arrows, 8);
});

test("Slab the Killer turns a beer into a second wound", () => {
  let state = stopRolling(roll(table({ s0: "slab" }), [], loaded("one", "beer", "arrow", "dynamite", "dynamite"), name));
  const before = state.players.s1.life;
  state = resolve(state, { shots: { 0: "s1" }, beers: {}, slab: { beer: 1, shot: 0 } }, name);
  assert.equal(state.players.s1.life, before - 2);
});

test("Jesse Jones drinks double when low; Suzy heals with no bull's eyes", () => {
  let state = set(table({ s0: "jesse" }), "s0", { life: 4 });
  state = resolve(stopRolling(roll(state, [], loaded("beer", "arrow", "dynamite", "dynamite", "gatling"), name)), { shots: {}, beers: { 0: "s0" } }, name);
  assert.equal(state.players.s0.life, 6);
  let suzy = set(table({ s0: "suzy" }), "s0", { life: 5 });
  suzy = resolve(stopRolling(roll(suzy, [], loaded("arrow", "dynamite", "dynamite", "gatling", "gatling"), name)), { shots: {}, beers: {} }, name);
  assert.equal(suzy.players.s0.life, 7);
});

test("Sid Ketchum gives a life before rolling", () => {
  let state = set({ ...table({ s0: "sid" }), step: "sid" }, "s2", { life: 3 });
  state = sidGives(state, "s2", name);
  assert.equal(state.players.s2.life, 4);
  assert.equal(state.step, "roll");
});

test("Vulture Sam feeds on the dead", () => {
  let state = set(set(table({ s3: "vulture" }), "s1", { life: 1 }), "s3", { life: 2 });
  state = wound(state, "s1", 1, "s0", "shot", name);
  assert.equal(state.players.s1.dead, true);
  assert.equal(state.players.s3.life, 4);
  assert.deepEqual(state.unmask, ["s1"], "the role waits to be turned over");
});

test("a death at the end of a turn waits for the role before moving on", () => {
  let state = set(table(), "s1", { life: 1 });
  state = stopRolling(roll(state, [], loaded("one", "arrow", "dynamite", "dynamite", "gatling"), name));
  state = resolve(state, { shots: { 0: "s1" }, beers: {} }, name);
  assert.equal(state.waiting, true);
  assert.equal(state.turn, "s0");
  state = unmasked(state, { s1: "deputy" }, name);
  assert.equal(state.turn, "s2", "the dead are skipped");
});

test("a death in the middle of someone's rolling does not end their turn", () => {
  let state = set({ ...table(), arrows: 1 }, "s2", { life: 1, arrows: 1 });
  state = roll(state, [], loaded("arrow", "one", "one", "beer", "beer"), name);
  assert.equal(state.players.s2.dead, true);
  state = unmasked(state, { s2: "outlaw" }, name);
  assert.equal(state.turn, "s0");
  assert.equal(state.step, "roll");
});

test("who wins", () => {
  const dead = (s: BangState, c: string, role: Role) => set(s, c, { dead: true, role });
  const state = table();
  assert.equal(winnerOf(dead(dead(dead(state, "s1", "renegade"), "s2", "outlaw"), "s3", "outlaw")), "sheriff");
  assert.equal(winnerOf(dead(state, "s0", "sheriff")), "outlaws");
  const renegadeLast = dead(dead(dead(dead(state, "s1", "outlaw"), "s2", "outlaw"), "s3", "deputy"), "s0", "sheriff");
  assert.equal(winnerOf(renegadeLast), "renegade");
  assert.equal(winnerOf(dead(renegadeLast, "s4", "renegade")), "outlaws", "all dead at once: the Outlaws");
});

test("at three, you win by taking out your own target", () => {
  const { state } = startGame(emptyBang(3), ["s0", "s1", "s2"], () => 0);
  const byRole = (r: Role) => state.order.find((c) => state.players[c].role === r) as string;
  const renegade = byRole("renegade");
  const right = wound(set(state, renegade, { life: 1 }), renegade, 1, byRole("deputy"), "shot", name);
  assert.equal(winnerOf(right), byRole("deputy"));
  const wrong = wound(set(state, renegade, { life: 1 }), renegade, 1, byRole("outlaw"), "shot", name);
  assert.equal(winnerOf(wrong), null, "the wrong hand: now it is last one standing");
  assert.equal(wrong.freeForAll, true);
});

test("taking arrows stops at the dead", () => {
  assert.equal(takeArrows(set(table(), "s1", { dead: true }), "s1", 3, name).arrows, ARROWS);
});

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("a role is read only by its owner, and its sealed copy can be turned over by anyone", async () => {
  const people = await Promise.all(Array.from({ length: 4 }, () => newUser(db)));
  const { itemId } = await tableFor(db, people[0], "bang");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const others = ["s1", "s2", "s3"];
  await run(people[0], "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([{ slot: ROLES_PILE, cards: ["renegade", "outlaw", "outlaw"], shuffle: true, copies: [{ slot: SEALED_PILE }] }]),
  ]);
  await run(people[0], "select public.pile_deal(p_item => $1, p_from => $2, p_targets => $3::jsonb)", [
    itemId,
    ROLES_PILE,
    JSON.stringify(others.map((c, i) => ({ slot: roleSlot(c), owner: people[i + 1], count: 1 }))),
  ]);
  await run(people[0], "select public.pile_deal(p_item => $1, p_from => $2, p_targets => $3::jsonb)", [
    itemId,
    SEALED_PILE,
    JSON.stringify(others.map((c) => ({ slot: sealedSlot(c), count: 1 }))),
  ]);
  const { rows: mine } = await run(people[1], "select slot, cards from public.secrets where item_id = $1", [itemId]);
  assert.deepEqual((mine as Array<{ slot: string }>).map((r) => r.slot), [roleSlot("s1")]);
  const myRole = (mine as Array<{ cards: string[] }>)[0].cards[0];
  const { rows: dealer } = await run(people[0], "select slot from public.secrets where item_id = $1", [itemId]);
  assert.equal(dealer.length, 0, "the dealer can read somebody's role");

  // s1 dies: somebody else turns the sealed copy over, and it matches.
  await run(people[2], "select public.pile_reveal(p_item => $1, p_slots => $2, p_keep => true)", [itemId, [sealedSlot("s1")]]);
  const { rows } = await db.query<{ data: { state: { revealed: Record<string, string[]> } } }>("select data from public.items where id = $1", [itemId]);
  assert.deepEqual(rows[0].data.state.revealed[sealedSlot("s1")], [myRole]);
});
