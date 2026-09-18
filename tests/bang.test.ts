import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  CARDS,
  DECK,
  alive,
  answerWithBang,
  blowsUp,
  canDrinkToLive,
  checked,
  checksDue,
  distance,
  dodge,
  drinkToLive,
  emptyBang,
  endTurn,
  fall,
  hurt,
  nameOf,
  play,
  playable,
  reach,
  roleSlot,
  rolesFor,
  sidHeals,
  startCheck,
  startGame,
  takeIt,
  targetsFor,
  tookFromStore,
  vultureFor,
  waitingOn,
  winnerOf,
  type BangState,
  type Character,
  type CardName,
} from "../src/lib/bang.ts";

const name = (c: string) => c;
const card = (kind: CardName, suit?: string, rank?: string) =>
  DECK.find((id) => nameOf(id) === kind && (!suit || CARDS[id].suit === suit) && (!rank || CARDS[id].rank === rank)) as string;

/** A game of five with chosen characters, s0 the Sheriff, on s0's main step. */
function table(characters: Partial<Record<string, Character>> = {}, n = 5): BangState {
  const chairs = Array.from({ length: n }, (_, i) => `s${i}`);
  const { state } = startGame(emptyBang(n), chairs, () => 0);
  const players = { ...state.players };
  for (const c of chairs) {
    const character = characters[c] ?? "bart";
    const max = (character === "paul" || character === "gringo" ? 3 : 4) + (c === "s0" ? 1 : 0);
    players[c] = { character, life: max, max, inPlay: [], ...(c === "s0" ? { role: "sheriff" as const } : {}) };
  }
  return { ...state, players, turn: "s0", step: "main" };
}

const put = (state: BangState, chair: string, ...cards: string[]): BangState => ({
  ...state,
  players: { ...state.players, [chair]: { ...state.players[chair], inPlay: [...state.players[chair].inPlay, ...cards] } },
});

test("the deck is the base game's eighty, each card its own", () => {
  assert.equal(DECK.length, 80);
  assert.equal(new Set(DECK).size, 80);
  const count = (k: CardName) => DECK.filter((id) => nameOf(id) === k).length;
  assert.equal(count("bang"), 25);
  assert.equal(count("missed"), 12);
  assert.equal(count("beer"), 6);
  assert.equal(count("jail"), 3);
});

test("the roles fit the table", () => {
  assert.deepEqual([...rolesFor(4)].sort(), ["outlaw", "outlaw", "renegade", "sheriff"]);
  assert.equal(rolesFor(5).filter((r) => r === "deputy").length, 1);
  assert.equal(rolesFor(7).filter((r) => r === "outlaw").length, 3);
  assert.equal(rolesFor(7).length, 7);
});

test("the Sheriff is chosen in the open, starts the game, and has a life extra", () => {
  const { state, sheriff, otherRoles, hands } = startGame(emptyBang(5), ["s0", "s1", "s2", "s3", "s4"], () => 2);
  assert.equal(state.turn, sheriff);
  assert.equal(state.players[sheriff].role, "sheriff");
  assert.equal(otherRoles.includes("sheriff"), false);
  assert.equal(otherRoles.length, 4);
  assert.equal(hands[sheriff], state.players[sheriff].max);
  for (const c of state.order) if (c !== sheriff) assert.equal(state.players[c].role, undefined, "a role other than the Sheriff's is public");
});

test("distance goes round the table the short way, with horses and scopes", () => {
  let state = table();
  assert.equal(distance(state, "s0", "s1"), 1);
  assert.equal(distance(state, "s0", "s2"), 2);
  assert.equal(distance(state, "s0", "s4"), 1, "round the other way");
  state = put(state, "s1", card("mustang"));
  assert.equal(distance(state, "s0", "s1"), 2);
  state = put(state, "s0", card("scope"));
  assert.equal(distance(state, "s0", "s1"), 1);
  assert.equal(distance(table({ s1: "paul" }), "s0", "s1"), 2);
  assert.equal(distance(table({ s0: "rose" }), "s0", "s2"), 1);
});

test("the dead do not count in distances", () => {
  const state = table();
  state.players.s1 = { ...state.players.s1, dead: true };
  assert.equal(distance(state, "s0", "s2"), 1);
});

test("a gun decides how far a BANG! reaches, and one BANG! a turn", () => {
  let state = table();
  const bang = card("bang");
  assert.deepEqual(targetsFor(state, "s0", bang), ["s1", "s4"]);
  state = put(state, "s0", card("remington"));
  assert.equal(reach(state, "s0"), 3);
  assert.deepEqual(targetsFor(state, "s0", bang), ["s1", "s2", "s3", "s4"]);
  state = { ...state, bangs: 1 };
  assert.deepEqual(targetsFor(state, "s0", bang), [], "the second BANG! of the turn");
  assert.equal(targetsFor(table({ s0: "willy" }), "s0", bang)?.length, 2);
  assert.equal(targetsFor({ ...table({ s0: "willy" }), bangs: 3 }, "s0", bang)?.length, 2, "Willy shoots as often as he likes");
});

test("a new gun replaces the old one", () => {
  let state = put(table(), "s0", card("schofield"));
  state = play(state, "s0", card("winchester"), null, name).state;
  assert.equal(state.players.s0.inPlay.filter((id) => ["schofield", "winchester"].includes(nameOf(id))).length, 1);
  assert.equal(nameOf(state.discard[0]), "schofield");
});

test("a shot is dodged with a Missed!, or it costs a life", () => {
  let state = play(table(), "s0", card("bang"), "s1", name).state;
  assert.equal(waitingOn(state), "s1");
  const dodged = dodge(state, name, card("missed"));
  assert.equal(dodged.pending, null);
  assert.equal(dodged.players.s1.life, 4);
  state = takeIt(state, name);
  assert.equal(state.players.s1.life, 3);
  assert.equal(state.pending, null);
});

test("Slab the Killer's shots take two Missed! to stop", () => {
  let state = play(table({ s0: "slab" }), "s0", card("bang"), "s1", name).state;
  state = dodge(state, name, card("missed"));
  assert.equal(waitingOn(state), "s1", "one was not enough");
  state = dodge(state, name, card("missed", "S", "3"));
  assert.equal(state.pending, null);
});

test("a barrel that comes up hearts is a Missed!", () => {
  let state = put(play(table(), "s0", card("bang"), "s1", name).state, "s1", card("barrel"));
  state = startCheck(state, "barrel", "s1");
  state = checked(state, [card("beer")], name);
  assert.equal(state.pending, null);
  let spade = put(play(table(), "s0", card("bang"), "s1", name).state, "s1", card("barrel"));
  spade = checked(startCheck(spade, "barrel", "s1"), [card("missed", "S")], name);
  assert.equal(waitingOn(spade), "s1", "still has to answer");
  assert.equal(spade.pending?.kind === "shot" && spade.pending.barrel, true, "and the barrel is spent");
});

test("the Gatling and Indians! go round everyone else in turn", () => {
  let state = play(table(), "s0", card("gatling"), null, name).state;
  assert.equal(waitingOn(state), "s1");
  state = takeIt(state, name);
  assert.equal(waitingOn(state), "s2");
  state = dodge(state, name, card("missed"));
  assert.equal(waitingOn(state), "s3");
  let indians = play(table(), "s0", card("indians"), null, name).state;
  indians = answerWithBang(indians, card("bang", "D"), name);
  assert.equal(waitingOn(indians), "s2");
});

test("a duel goes back and forth until someone cannot answer", () => {
  let state = play(table(), "s0", card("duel"), "s2", name).state;
  assert.equal(waitingOn(state), "s2");
  state = answerWithBang(state, card("bang", "D"), name);
  assert.equal(waitingOn(state), "s0");
  state = takeIt(state, name);
  assert.equal(state.players.s0.life, 4);
  assert.equal(state.pending, null);
});

test("dynamite blows on a spade from 2 to 9, or moves on", () => {
  assert.equal(blowsUp(card("missed", "S", "5")), true);
  assert.equal(blowsUp(card("bang", "S", "A")), false);
  let state = put({ ...table(), step: "checks" as const }, "s0", card("dynamite"));
  assert.deepEqual(checksDue(state), ["dynamite"]);
  const quiet = checked(startCheck(state, "dynamite", "s0"), [card("beer")], name);
  assert.equal(quiet.players.s1.inPlay.some((id) => nameOf(id) === "dynamite"), true);
  state = checked(startCheck(state, "dynamite", "s0"), [card("missed", "S", "5")], name);
  assert.equal(state.players.s0.life, 2);
  assert.equal(state.players.s0.inPlay.length, 0);
});

test("jail: a heart walks out, anything else loses the turn", () => {
  const jailed = put({ ...table(), turn: "s1", step: "checks" as const }, "s1", card("jail"));
  const out = checked(startCheck(jailed, "jail", "s1"), [card("beer")], name);
  assert.equal(out.turn, "s1");
  const stays = checked(startCheck(jailed, "jail", "s1"), [card("missed")], name);
  assert.equal(stays.turn, "s2");
  assert.equal(stays.players.s1.inPlay.length, 0, "the jail is used up either way");
  assert.deepEqual(targetsFor(table(), "s1", card("jail")), ["s2", "s3", "s4"], "nobody jails the Sheriff");
});

test("Lucky Duke keeps the better of two", () => {
  const jailed = put({ ...table({ s1: "lucky" }), turn: "s1", step: "checks" as const }, "s1", card("jail"));
  const out = checked(startCheck(jailed, "jail", "s1"), [card("missed"), card("beer")], name);
  assert.equal(out.turn, "s1");
});

test("at no lives a Beer keeps you up, unless only two are left", () => {
  let state: BangState = { ...table(), players: { ...table().players, s1: { ...table().players.s1, life: 1 } } };
  state = hurt(state, "s1", 1, "s0", name);
  assert.equal(waitingOn(state), "s1");
  assert.equal(canDrinkToLive(state), true);
  state = drinkToLive(state, card("beer"), name);
  assert.equal(state.players.s1.life, 1);
  assert.equal(state.pending, null);
});

test("a dead Outlaw pays the killer three cards; a Sheriff who kills his Deputy loses everything", () => {
  let state: BangState = { ...table(), players: { ...table().players, s1: { ...table().players.s1, life: 1 } } };
  state = hurt(state, "s1", 1, "s0", name);
  state = fall(state, "outlaw", [card("beer")], name);
  assert.equal(state.players.s1.dead, true);
  assert.equal(state.players.s1.role, "outlaw");
  assert.deepEqual(state.owed, [{ to: "s0", draw: 3 }]);
  assert.equal(nameOf(state.discard[0]), "beer");

  let deputy: BangState = { ...table(), players: { ...table().players, s2: { ...table().players.s2, life: 1 } } };
  deputy = fall(hurt(deputy, "s2", 1, "s0", name), "deputy", [], name);
  assert.deepEqual(deputy.owed, [{ to: "s0", discardAll: true }]);
});

test("Vulture Sam gets the dead player's cards instead of the discards", () => {
  let state: BangState = { ...table({ s3: "vulture" }), players: { ...table({ s3: "vulture" }).players, s1: { ...table().players.s1, life: 1 } } };
  state = fall(hurt(state, "s1", 1, "s0", name), "renegade", [card("beer")], name);
  assert.equal(vultureFor(table({ s3: "vulture" }), "s1"), "s3");
  assert.equal(state.discard.length, 0);
});

test("the Sheriff's side wins when every Outlaw and the Renegade are dead", () => {
  const state = table();
  const dead = (s: BangState, c: string, role: "outlaw" | "renegade" | "deputy" | "sheriff") => ({
    ...s,
    players: { ...s.players, [c]: { ...s.players[c], dead: true, role } },
  });
  let s = dead(dead(state, "s1", "outlaw"), "s2", "outlaw");
  assert.equal(winnerOf(s), null);
  s = dead(s, "s3", "renegade");
  assert.equal(winnerOf(s), "sheriff");
  assert.equal(winnerOf(dead(state, "s0", "sheriff")), "outlaws");
  const lastOne = dead(dead(dead(dead(state, "s1", "outlaw"), "s2", "outlaw"), "s3", "deputy"), "s0", "sheriff");
  assert.equal(winnerOf(lastOne), "renegade");
});

test("the turn passes over the dead", () => {
  const state = table();
  state.players.s1 = { ...state.players.s1, dead: true };
  assert.equal(endTurn(state, name).turn, "s2");
  assert.deepEqual(alive(state), ["s0", "s2", "s3", "s4"]);
});

test("only what can be played shows as playable", () => {
  const state = table();
  assert.equal(playable(state, "s0", card("missed")), false, "a Missed! is an answer, not a move");
  assert.equal(playable(state, "s0", card("beer")), false, "at full life");
  assert.equal(playable(state, "s1", card("bang")), false, "not your turn");
  assert.equal(playable(put(state, "s0", card("barrel")), "s0", card("barrel", "S", "K")), false, "one barrel is enough");
  assert.equal(playable(state, "s0", card("stagecoach")), true);
});

test("Sid Ketchum trades two cards for a life", () => {
  const state = { ...table({ s2: "sid" }), players: { ...table({ s2: "sid" }).players } };
  state.players.s2 = { ...state.players.s2, life: 2 };
  assert.equal(sidHeals(state, "s2", [card("bang"), card("missed")], name).players.s2.life, 3);
  assert.equal(sidHeals(state, "s1", [card("bang"), card("missed")], name), state, "only Sid");
});

test("the General Store goes round, starting with whoever opened it", () => {
  let state = play(table(), "s0", card("store"), null, name).state;
  assert.equal(waitingOn(state), "s0");
  state = tookFromStore(state, card("beer"), name);
  assert.equal(waitingOn(state), "s1");
  assert.deepEqual(state.pending?.kind === "store" && state.pending.taken, [card("beer")]);
});

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("roles are dealt so only their owners can read them, and a dead one can be turned over", async () => {
  const people = await Promise.all(Array.from({ length: 4 }, () => newUser(db)));
  const { itemId } = await tableFor(db, people[0], "bang");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const others = ["s1", "s2", "s3"];
  await run(people[0], "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([
      { slot: "roles", cards: ["renegade", "outlaw", "outlaw"], shuffle: true },
      { slot: "deck", cards: DECK, shuffle: true },
    ]),
  ]);
  await run(people[0], "select public.pile_deal(p_item => $1, p_from => 'roles', p_targets => $2::jsonb)", [
    itemId,
    JSON.stringify(others.map((c, i) => ({ slot: roleSlot(c), owner: people[i + 1], count: 1 }))),
  ]);
  const { rows: mine } = await run(people[1], "select slot, cards from public.secrets where item_id = $1", [itemId]);
  assert.deepEqual((mine as Array<{ slot: string }>).map((r) => r.slot), [roleSlot("s1")]);
  const { rows: dealer } = await run(people[0], "select slot from public.secrets where item_id = $1", [itemId]);
  assert.equal(dealer.length, 0, "the dealer can read somebody's role");

  await assert.rejects(run(people[0], "select public.pile_reveal(p_item => $1, p_slots => $2, p_keep => true)", [itemId, [roleSlot("s1")]]));
  await run(people[1], "select public.pile_reveal(p_item => $1, p_slots => $2, p_keep => true)", [itemId, [roleSlot("s1")]]);
  const { rows } = await db.query<{ data: { state: { revealed: Record<string, string[]> } } }>("select data from public.items where id = $1", [itemId]);
  assert.equal(rows[0].data.state.revealed[roleSlot("s1")].length, 1);
});
