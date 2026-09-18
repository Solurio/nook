import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import { PACKS } from "../src/lib/cah-packs.ts";
import {
  BLANK,
  HAND,
  SAT_OUT,
  WHITE_PILE,
  addBlacks,
  allRevealed,
  answerOrder,
  answering,
  deckProblem,
  decksFor,
  emptyCah,
  fill,
  handSlot,
  judgeable,
  nextRound,
  normalizePrompt,
  parseCards,
  pickOf,
  pickWinner,
  playSlot,
  promptOf,
  startGame,
  usedAnswers,
  type CahState,
} from "../src/lib/cah.ts";

const first = () => 0;

function game(extra: Partial<CahState> = {}): CahState {
  const started = startGame({ ...emptyCah(4), packs: ["en"] }, ["s0", "s1", "s2", "s3"], first);
  if ("problem" in started) throw new Error(started.problem);
  return { ...started.state, ...extra };
}

/** The table as it looks once these answers have been turned over. */
const answered = (state: CahState, answers: Record<string, string[]>): CahState => ({
  ...state,
  revealed: Object.fromEntries(Object.entries(answers).map(([c, cards]) => [playSlot(state.round, c), cards])),
});

test("the starter packs: enough of both colours, every blank written the same, nothing repeated", () => {
  for (const pack of Object.values(PACKS)) {
    assert.ok(pack.black.length >= 40, pack.name);
    assert.ok(pack.white.length >= 120, pack.name);
    assert.equal(new Set(pack.white).size, pack.white.length, `${pack.name} repeats a white card`);
    assert.equal(new Set(pack.black).size, pack.black.length, `${pack.name} repeats a black card`);
    for (const b of pack.black) {
      assert.equal(normalizePrompt(b), b, b);
      assert.ok(pickOf(b) >= 1 && pickOf(b) <= 2, b);
    }
  }
});

test("writing your own: one card a line, any underscores make a blank", () => {
  assert.deepEqual(parseCards("  A goose \n\n a goose\nSoup.  \n"), ["A goose", "Soup."]);
  assert.deepEqual(parseCards("Why is ___ here?\nI love _ and _____.", true), [`Why is ${BLANK} here?`, `I love ${BLANK} and ${BLANK}.`]);
  assert.equal(pickOf(`I love ${BLANK} and ${BLANK}.`), 2);
  assert.equal(pickOf("Tell me a secret."), 1);
});

test("the answer reads into the question", () => {
  const text = (parts: ReturnType<typeof fill>) => parts.map((p) => p.text).join("");
  assert.equal(text(fill(`What's that smell? ${BLANK}.`, ["A goose with a knife."])), "What's that smell? A goose with a knife.");
  assert.equal(text(fill(`${BLANK} meets ${BLANK}.`, ["Soup.", "Bees?"])), "Soup meets Bees?.");
  assert.equal(text(fill("Tell me a secret.", ["Soup."])), "Tell me a secret. Soup.");
  assert.ok(fill(`Why ${BLANK}?`, ["Soup."]).some((p) => p.answer && p.text === "Soup"));
});

test("a game needs cards enough for every hand", () => {
  assert.equal(deckProblem({ packs: ["en"], custom: { black: [], white: [] } }, 10), null);
  assert.match(deckProblem({ packs: [], custom: { black: ["Why ____?"], white: ["a", "b"] } }, 3) ?? "", /need at least 33/);
  assert.match(deckProblem({ packs: [], custom: { black: [], white: [] } }, 3) ?? "", /no black cards/);
  const both = decksFor({ packs: ["en", "pt"], custom: { black: ["Why ____?"], white: ["My own card."] } });
  assert.equal(both.black.length, PACKS.en.black.length + PACKS.pt.black.length + 1);
  assert.ok(both.white.includes("My own card."));
});

test("starting: a czar, the black cards shuffled, everyone on nought", () => {
  const state = game();
  assert.equal(state.phase, "play");
  assert.equal(state.czar, "s0");
  assert.deepEqual(answering(state), ["s1", "s2", "s3"]);
  assert.ok(promptOf(state).length > 0);
  assert.deepEqual(state.points, { s0: 0, s1: 0, s2: 0, s3: 0 });
});

test("the answers are laid out the same on every screen, and mixed", () => {
  const state = game({ seed: 12345 });
  assert.deepEqual(answerOrder(state), answerOrder({ ...state }));
  assert.deepEqual([...answerOrder(state)].sort(), ["s1", "s2", "s3"]);
  const orders = new Set(Array.from({ length: 12 }, (_, round) => answerOrder({ ...state, round: round + 1 }).join()));
  assert.ok(orders.size > 1, "always the same order, round after round");
});

test("the czar picks only once everything is turned over, and never someone who sat out", () => {
  const state = game();
  const partial = answered(state, { s1: ["Soup."], s2: ["Bees?"] });
  assert.equal(pickWinner(partial, "s1"), partial);
  const all = answered(state, { s1: ["Soup."], s2: ["Bees?"], s3: [SAT_OUT] });
  assert.ok(allRevealed(all));
  assert.deepEqual([...judgeable(all)].sort(), ["s1", "s2"]);
  assert.equal(pickWinner(all, "s3"), all);
  assert.equal(pickWinner(all, "s0"), all, "the czar cannot pick themselves");
  const picked = pickWinner(all, "s2");
  assert.equal(picked.step, "picked");
  assert.equal(picked.points.s2, 1);
});

test("the next round passes the czar on and turns up the next black card", () => {
  const picked = pickWinner(answered(game(), { s1: ["Soup."], s2: ["Bees?"], s3: ["Moist."] }), "s1");
  const next = nextRound(picked, first);
  assert.equal(next.czar, "s1");
  assert.equal(next.round, 2);
  assert.equal(next.blackAt, 1);
  assert.equal(next.step, "answer");
  assert.equal(next.picked, null);
  // Out of black cards: round again.
  const last = nextRound({ ...picked, blackAt: picked.blacks.length - 1 }, first);
  assert.equal(last.blackAt, 0);
});

test("reaching the goal wins the game", () => {
  const state = answered(game({ goal: 5, points: { s0: 0, s1: 4, s2: 0, s3: 0 } }), { s1: ["Soup."], s2: ["Bees?"], s3: ["Moist."] });
  const over = pickWinner(state, "s1");
  assert.equal(over.phase, "over");
  assert.equal(over.champion, "s1");
  assert.equal(over.wins.s1, 1);
});

test("used answers go back once, and new black cards join what is still to come", () => {
  const state: CahState = {
    ...game(),
    round: 3,
    revealed: {
      [playSlot(1, "s1")]: ["Soup."],
      [playSlot(1, "s2")]: [SAT_OUT],
      [playSlot(2, "s3")]: ["Bees?", "Moist."],
      [playSlot(3, "s2")]: ["Not yet."],
    },
  };
  assert.deepEqual(usedAnswers(state), ["Soup.", "Bees?", "Moist."]);
  assert.deepEqual(usedAnswers({ ...state, recycled: 1 }), ["Bees?", "Moist."]);
  const more = addBlacks(state, ["Why is there ___ here?"], first);
  assert.equal(more.blacks.length, state.blacks.length + 1);
  assert.deepEqual(more.blacks.slice(0, state.blackAt + 1), state.blacks.slice(0, state.blackAt + 1), "what has been played stays put");
  assert.ok(more.blacks.includes(`Why is there ${BLANK} here?`));
});

let db: PGlite;

before(async () => {
  db = await freshDatabase();
});

test("answers stay face down until every one is in, then all turn over together", async () => {
  const people = await Promise.all(Array.from({ length: 3 }, () => newUser(db)));
  const { itemId } = await tableFor(db, people[0], "cah");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const whites = PACKS.en.white.slice(0, 40);
  await run(people[0], "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([{ slot: WHITE_PILE, cards: whites, shuffle: true }]),
  ]);
  await run(people[0], "select public.pile_deal(p_item => $1, p_from => $2, p_targets => $3::jsonb)", [
    itemId,
    WHITE_PILE,
    JSON.stringify(people.map((p, i) => ({ slot: handSlot(`s${i}`), owner: p, count: HAND }))),
  ]);
  // s0 is the czar; s1 and s2 answer.
  const seal = [playSlot(1, "s1"), playSlot(1, "s2")];
  const answer = async (i: number) => {
    const { rows } = await run(people[i], "select cards from public.secrets where item_id = $1 and slot = $2", [itemId, handSlot(`s${i}`)]);
    const card = (rows as Array<{ cards: string[] }>)[0].cards[0];
    await run(people[i], "select public.pile_put(p_item => $1, p_to => $2, p_cards => '[]'::jsonb, p_seal => $3::jsonb)", [itemId, playSlot(1, `s${i}`), JSON.stringify(seal)]);
    await run(people[i], "select public.pile_move(p_item => $1, p_from => $2, p_to => $3, p_cards => $4::jsonb)", [itemId, handSlot(`s${i}`), playSlot(1, `s${i}`), JSON.stringify([card])]);
    return card;
  };
  const a1 = await answer(1);
  // Nobody can read an answer, nor turn it over early.
  const { rows: peek } = await run(people[0], "select slot from public.secrets where item_id = $1 and slot like 'play:%'", [itemId]);
  assert.equal(peek.length, 0);
  await assert.rejects(run(people[0], "select public.pile_reveal(p_item => $1, p_slots => $2)", [itemId, seal]), /committed/);
  const a2 = await answer(2);
  await run(people[0], "select public.pile_reveal(p_item => $1, p_slots => $2)", [itemId, seal]);
  const { rows } = await db.query<{ data: { state: { revealed: Record<string, string[]>; piles: Record<string, { size: number }> } } }>("select data from public.items where id = $1", [itemId]);
  assert.deepEqual(rows[0].data.state.revealed[playSlot(1, "s1")], [a1]);
  assert.deepEqual(rows[0].data.state.revealed[playSlot(1, "s2")], [a2]);
  assert.equal(rows[0].data.state.piles[handSlot("s1")].size, HAND - 1);
  // Someone who never answered: a stand-in lets the round go on.
  await run(people[0], "select public.pile_put(p_item => $1, p_to => $2, p_cards => $3::jsonb)", [itemId, playSlot(2, "s2"), JSON.stringify([SAT_OUT])]);
  await run(people[0], "select public.pile_reveal(p_item => $1, p_slots => $2)", [itemId, [playSlot(2, "s2")]]);
});
