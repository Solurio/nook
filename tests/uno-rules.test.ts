import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASSIC_RULES,
  PRESETS,
  afterChallenge,
  afterChoosing,
  afterMercy,
  afterPlay,
  afterRoulette,
  afterTaking,
  chairsFor,
  chaosAfter,
  companions,
  emptyUno,
  fullDeck,
  jumpable,
  openWith,
  playable,
  presetOf,
  roundOver,
  seatAfter,
  stacks,
  swapDone,
  swapWork,
  transitSlot,
  type UnoRules,
  type UnoState,
} from "../src/lib/uno.ts";

const name = (chair: string) => chair;
const chairs = chairsFor(4);

function table(rules: Partial<UnoRules> = {}, overrides: Partial<UnoState> = {}): UnoState {
  return {
    ...emptyUno(4),
    rules: { ...CLASSIC_RULES, ...rules },
    discard: ["R5"],
    color: "R",
    turn: "s0",
    dealer: "s3",
    round: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Decks and presets
// ---------------------------------------------------------------------------

test("the no mercy deck adds its cards, chaos adds the swap wilds", () => {
  const mercy = fullDeck({ ...CLASSIC_RULES, mercy: true });
  assert.equal(mercy.filter((c) => c === "W10").length, 2);
  assert.equal(mercy.filter((c) => c === "R+4").length, 2);
  assert.equal(mercy.filter((c) => c === "GDA").length, 2);
  assert.equal(fullDeck({ ...CLASSIC_RULES, chaos: true }).filter((c) => c === "WS").length, 4);
  assert.equal(fullDeck(CLASSIC_RULES, 2).length, 216, "two boxes shuffled together");
});

test("every preset is recognised as itself", () => {
  for (const p of PRESETS) assert.equal(presetOf(p.rules), p.id);
  assert.equal(presetOf({ ...CLASSIC_RULES, hand: 9 }), null);
});

// ---------------------------------------------------------------------------
// Stacking and sending draws back
// ---------------------------------------------------------------------------

test("with stacking, a draw two waits for its target instead of landing", () => {
  const { state, penalty } = afterPlay(table({ stack: "same" }), chairs, "R+", null, 5, name);
  assert.equal(penalty, null);
  assert.equal(state.pending?.count, 2);
  assert.equal(state.turn, "s1", "the target is the one to answer it");
});

test("stacked draws add up and move on", () => {
  const first = afterPlay(table({ stack: "same" }), chairs, "R+", null, 5, name).state;
  const second = afterPlay(first, chairs, "B+", null, 5, name).state;
  assert.equal(second.pending?.count, 4);
  assert.equal(second.turn, "s2");
});

test("what may stack depends on the rule", () => {
  const two = { count: 2, by: "s0", card: "R+" };
  assert.ok(stacks("B+", two, "R", "same"));
  assert.ok(!stacks("W4", two, "R", "same"));
  assert.ok(stacks("W4", two, "R", "up"));
  const four = { count: 4, by: "s0", card: "W4" };
  assert.ok(!stacks("R+", four, "R", "up"), "smaller does not go on bigger");
  assert.ok(stacks("R+", four, "R", "any"), "anything goes, in the colour called");
  assert.ok(!stacks("B+", four, "R", "any"), "but a coloured card still has to fit");
});

test("facing a draw, only answers are playable", () => {
  const facing = table({ stack: "same" }, { discard: ["R+"], pending: { count: 2, by: "s3", card: "R+" } });
  const rules = { ...CLASSIC_RULES, stack: "same" as const };
  assert.deepEqual(playable(["R7", "G+", "RR"], "R+", "R", rules, facing.pending), ["G+"]);
  const reflecting = { ...rules, reflect: true };
  assert.deepEqual(playable(["R7", "G+", "RR", "BS"], "R+", "R", reflecting, facing.pending), ["G+", "RR"]);
});

test("a reverse sends a pending draw back where it came from", () => {
  const facing = table({ stack: "any", reflect: true }, { turn: "s1", discard: ["R+"], pending: { count: 2, by: "s0", card: "R+" } });
  const { state } = afterPlay(facing, chairs, "RR", null, 5, name);
  assert.equal(state.turn, "s0");
  assert.equal(state.pending?.count, 2);
  assert.equal(state.direction, -1);
});

test("a skip passes a pending draw along", () => {
  const facing = table({ stack: "any", reflect: true }, { turn: "s1", discard: ["R+"], pending: { count: 2, by: "s0", card: "R+" } });
  const { state } = afterPlay(facing, chairs, "RS", null, 5, name);
  assert.equal(state.turn, "s2");
  assert.equal(state.pending?.count, 2);
});

test("taking a pending draw costs the go", () => {
  const facing = table({ stack: "same" }, { turn: "s1", pending: { count: 6, by: "s0", card: "R+" } });
  const next = afterTaking(facing, chairs, name);
  assert.equal(next.pending, null);
  assert.equal(next.turn, "s2");
});

// ---------------------------------------------------------------------------
// Challenging the wild draw four
// ---------------------------------------------------------------------------

test("with challenges on, a wild draw four remembers the colour before it", () => {
  const { state } = afterPlay(table({ challenge: true }), chairs, "W4", "G", 5, name);
  assert.equal(state.pending?.challenge, "R");
  assert.equal(state.turn, "s1");
  assert.deepEqual(playable(["W4", "R2"], "R5", "R", { ...CLASSIC_RULES, challenge: true }), ["W4", "R2"], "and may be bluffed");
});

test("a bluff caught costs the bluffer four; a wrong challenge costs six and the go", () => {
  const facing = table({ challenge: true }, { turn: "s1", pending: { count: 4, by: "s0", card: "W4", challenge: "R" } });
  const caught = afterChallenge(facing, chairs, true, name);
  assert.deepEqual(caught.penalty, { chair: "s0", count: 4 });
  assert.equal(caught.state.turn, "s1", "the challenger plays on");
  const wrong = afterChallenge(facing, chairs, false, name);
  assert.deepEqual(wrong.penalty, { chair: "s1", count: 6 });
  assert.equal(wrong.state.turn, "s2");
});

// ---------------------------------------------------------------------------
// Cutting in, pairs, 7-0
// ---------------------------------------------------------------------------

test("cutting in needs the very card on top, and play goes on from whoever cut in", () => {
  const rules = { ...CLASSIC_RULES, jumpIn: true };
  assert.deepEqual(jumpable(["R5", "B5", "R6"], "R5", rules), ["R5"]);
  assert.deepEqual(jumpable(["R5"], "R5", CLASSIC_RULES), []);
  const { state } = afterPlay(table({ jumpIn: true }), chairs, "R5", null, 4, name, { actor: "s2" });
  assert.equal(state.turn, "s3");
  assert.match(state.log.at(-1) ?? "", /cut in/);
});

test("the same number can go down several at once", () => {
  const rules = { ...CLASSIC_RULES, multiples: true };
  assert.deepEqual(companions(["R5", "B5", "G5", "R7"], "R5", rules), ["B5", "G5"]);
  assert.deepEqual(companions(["RS", "BS"], "RS", rules), [], "numbers only");
  const { state } = afterPlay(table({ multiples: true }), chairs, ["B5", "R5"], null, 3, name);
  assert.deepEqual(state.discard.slice(0, 3), ["R5", "B5", "R5"], "the last one ends on top");
});

test("a 7 asks whose hand to take, and the swap is set up both ways", () => {
  const { state } = afterPlay(table({ sevenO: true }), chairs, "R7", null, 5, name);
  assert.deepEqual(state.choosing, { chair: "s0", kind: "seven" });
  assert.equal(state.turn, "s0");
  const swapped = afterChoosing(state, chairs, "s2", name, 99);
  assert.deepEqual(swapped.swap, { id: 99, moves: { s0: "s2", s2: "s0" } });
  assert.equal(swapped.turn, "s1");
});

test("a 0 passes every hand along the way play is going", () => {
  const { state } = afterPlay(table({ sevenO: true }), chairs, "R0", null, 5, name, { now: 7 });
  assert.deepEqual(state.swap?.moves, { s0: "s1", s1: "s2", s2: "s3", s3: "s0" });
});

test("going out on the 7 needs no swap", () => {
  const { state } = afterPlay(table({ sevenO: true }), chairs, "R7", null, 0, name);
  assert.equal(state.choosing, null);
  assert.ok(roundOver(state));
});

test("a swap is done once every hand has left and arrived", () => {
  const swap = { id: 5, moves: { s0: "s1", s1: "s0" } };
  const mine = (c: string) => c === "s0";
  assert.deepEqual(swapWork(swap, {}, mine), [{ kind: "send", chair: "s0", to: "s1" }]);
  const sentBoth = { [transitSlot(5, "s1")]: { owner: null, size: 3 }, [transitSlot(5, "s0")]: { owner: null, size: 4 } };
  assert.deepEqual(swapWork(swap, sentBoth, mine), [{ kind: "take", chair: "s0" }]);
  assert.ok(!swapDone(swap, sentBoth));
  const arrived = { [transitSlot(5, "s1")]: { owner: null, size: 0 }, [transitSlot(5, "s0")]: { owner: null, size: 0 } };
  assert.ok(swapDone(swap, arrived));
});

// ---------------------------------------------------------------------------
// Going out
// ---------------------------------------------------------------------------

test("with no going out on a special, a last action card cannot be played", () => {
  const rules = { ...CLASSIC_RULES, noActionFinish: true };
  assert.deepEqual(playable(["RS"], "R5", "R", rules), []);
  assert.deepEqual(playable(["RS", "R2"], "R5", "R", rules), ["RS", "R2"]);
});

test("playing to the last one, going out just takes you out of the round", () => {
  const first = afterPlay(table({ end: "last" }), chairs, "R7", null, 0, name);
  assert.ok(!roundOver(first.state));
  assert.deepEqual(first.state.out, ["s0"]);
  assert.equal(first.state.turn, "s1");
  assert.equal(seatAfter(chairs, "s3", 1, 1, ["s0"]), "s1", "empty chairs are stepped over");
});

test("the last two: the one who goes out leaves the other holding cards", () => {
  const late = table({ end: "last" }, { out: ["s1", "s2"], turn: "s0" });
  const { state } = afterPlay(late, chairs, "R7", null, 0, name);
  assert.ok(roundOver(state));
  assert.equal(state.losers?.["1"], "s3");
});

// ---------------------------------------------------------------------------
// No mercy and chaos
// ---------------------------------------------------------------------------

test("skip everyone gives you another go", () => {
  const { state } = afterPlay(table({ mercy: true }), chairs, "RSA", null, 5, name);
  assert.equal(state.turn, "s0");
});

test("colour roulette leaves the next player drawing until the colour comes", () => {
  const { state } = afterPlay(table({ mercy: true, stack: "any" }), chairs, "WC", "B", 5, name);
  assert.deepEqual(state.pending?.roulette, "B");
  assert.equal(state.turn, "s1");
  assert.deepEqual(playable(["B7"], "WC", "B", { ...CLASSIC_RULES, mercy: true }, state.pending), [], "nothing to play meanwhile");
  const done = afterRoulette(state, chairs, 3, name);
  assert.equal(done.turn, "s2");
  assert.equal(done.pending, null);
});

test("over the mercy limit you are out, and the last left wins", () => {
  const two = { ...table({ mercy: true }, { out: ["s2", "s3"] }) };
  const next = afterMercy(two, chairs, "s1", name);
  assert.ok(next.out?.includes("s1"));
  assert.equal(next.results["1"], "s0");
});

test("nothing that asks for more than a colour opens a round", () => {
  for (const card of ["W6", "WC", "WS", "R+4", "BSA", "GDA"]) assert.equal(openWith(table(), chairs, card), "again", card);
});

test("chaos sometimes does something, and says what", () => {
  const played = afterPlay(table({ chaos: true }), chairs, "R7", null, 5, name).state;
  assert.equal(chaosAfter(played, chairs, "s0", 0.9, {}), null, "most plays pass quietly");
  const rain = chaosAfter(played, chairs, "s0", 0.01, {});
  assert.ok(rain);
  assert.deepEqual(rain.draws.map((d) => d.chair), ["s1", "s2", "s3"]);
  const storm = chaosAfter(played, chairs, "s0", 0.1, {});
  assert.ok(storm && storm.state.color !== "R");
});
