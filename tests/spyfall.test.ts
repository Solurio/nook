import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SECONDS,
  MAX_SEATS,
  MIN_SEATS,
  PLACES,
  clock,
  deal,
  remaining,
} from "../src/lib/spyfall.ts";

const chairs = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

test("every place has a name and enough jobs to go round", () => {
  for (const pack of ["en", "pt"] as const) {
    assert.ok(PLACES[pack].length >= 12, `${pack} is a thin list`);
    for (const place of PLACES[pack]) {
      assert.ok(place.name.length > 0);
      assert.ok(place.roles.length >= 6, `${place.name} has too few jobs`);
      assert.equal(new Set(place.roles).size, place.roles.length, `${place.name} repeats a job`);
    }
    const names = PLACES[pack].map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `${pack} lists a place twice`);
  }
});

test("one person is told nothing and everybody else has a job", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    const seats = chairs(players);
    const round = deal(seats, "en");

    assert.ok(seats.includes(round.spy));
    assert.equal(round.roles[round.spy], undefined, "the spy holds no job");
    for (const chair of seats) {
      if (chair === round.spy) continue;
      assert.ok(round.roles[chair], `${chair} was told nothing`);
    }
    assert.equal(Object.keys(round.roles).length, players - 1);
  }
});

test("the place is one from the pack that was asked for", () => {
  const round = deal(chairs(6), "pt");
  assert.ok(round.location >= 0 && round.location < PLACES.pt.length);
  const place = PLACES.pt[round.location];
  for (const chair of Object.keys(round.roles)) {
    assert.ok(place.roles.includes(round.roles[chair]), `${round.roles[chair]} is not from here`);
  }
});

test("a table bigger than the place doubles a job rather than leaving someone blank", () => {
  // Every place has seven jobs, so twelve players means five of them repeat.
  const round = deal(chairs(12), "en");
  const given = Object.values(round.roles);
  assert.equal(given.length, 11);
  assert.ok(given.every((role) => role.length > 0));
});

test("the spy is not always the first chair", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) seen.add(deal(chairs(5), "en").spy);
  assert.ok(seen.size > 1, "the same person kept getting it");
});

test("the clock starts full and runs down", () => {
  assert.equal(remaining(null, DEFAULT_SECONDS, 1_000), DEFAULT_SECONDS);
  assert.equal(remaining(1_000, 480, 1_000), 480);
  assert.equal(remaining(1_000, 480, 61_000), 420, "a minute gone");
  assert.equal(remaining(1_000, 480, 9_999_999), 0, "never runs past zero");
});

test("stopping the clock hands back exactly what was left", () => {
  // Start with 480, run it for 37 seconds, stop: the banked number is what the
  // face was showing, not a rounded minute.
  const left = remaining(1_000, 480, 38_000);
  assert.equal(left, 443);
  assert.equal(remaining(null, left, 999_999), 443, "a stopped clock stays put");
});

test("the clock reads the way a clock reads", () => {
  assert.equal(clock(480), "8:00");
  assert.equal(clock(65), "1:05");
  assert.equal(clock(9), "0:09");
  assert.equal(clock(0), "0:00");
});

// ---------------------------------------------------------------------------
// Private briefings
// ---------------------------------------------------------------------------

import { before } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import { BRIEFINGS, SPY_CARD, briefingChoices, readBriefing, roleSlot, unmasked } from "../src/lib/spyfall.ts";

test("every possible deck has one spy and a job for everyone else, at one place", () => {
  const choices = briefingChoices("en", 5);
  assert.equal(choices.length, PLACES.en.length);
  choices.forEach((deck, p) => {
    assert.equal(deck.length, 5);
    assert.equal(deck.filter((c) => c === SPY_CARD).length, 1);
    for (const card of deck.filter((c) => c !== SPY_CARD)) {
      assert.equal(readBriefing(card, "en")?.spy, false);
      assert.equal((readBriefing(card, "en") as { place: number }).place, p);
    }
  });
});

test("the end of a round is read from the cards turned over", () => {
  const chairs = ["s0", "s1", "s2"];
  const shown = { [roleSlot("s0")]: ["3:1"], [roleSlot("s1")]: [SPY_CARD], [roleSlot("s2")]: ["3:0"] };
  const end = unmasked(shown, chairs, "en");
  assert.equal(end.spy, "s1");
  assert.equal(end.place, PLACES.en[3].name);
  assert.deepEqual(end.waitingOn, []);
  assert.deepEqual(unmasked({ [roleSlot("s0")]: ["3:1"] }, chairs, "en").waitingOn, ["s1", "s2"]);
});

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("a dealt round: everyone reads their own card, and nobody knows the answer", async () => {
  const people = [await newUser(db), await newUser(db), await newUser(db), await newUser(db)];
  const chairs = ["s0", "s1", "s2", "s3"];
  const { itemId } = await tableFor(db, people[0], "spyfall");

  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  await run(people[0], "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([{ slot: BRIEFINGS, choices: briefingChoices("en", 4), shuffle: true }]),
  ]);
  await run(people[0], "select public.pile_deal(p_item => $1, p_from => $2, p_targets => $3::jsonb)", [
    itemId,
    BRIEFINGS,
    JSON.stringify(chairs.map((c, i) => ({ slot: roleSlot(c), owner: people[i], count: 1 }))),
  ]);

  const cards: string[] = [];
  for (const [i, person] of people.entries()) {
    const { rows } = await run(person, "select slot, cards from public.secrets where item_id = $1", [itemId]);
    const readable = rows as Array<{ slot: string; cards: string[] }>;
    assert.deepEqual(readable.map((r) => r.slot), [roleSlot(chairs[i])], "each reads their own card, and only that");
    cards.push(readable[0].cards[0]);
  }

  assert.equal(cards.filter((c) => c === SPY_CARD).length, 1, "exactly one spy");
  const places = new Set(cards.filter((c) => c !== SPY_CARD).map((c) => readBriefing(c, "en")?.spy === false && (readBriefing(c, "en") as { place: number }).place));
  assert.equal(places.size, 1, "every agent is at the same place");

  const { rows } = await db.query<{ data: unknown }>("select data from public.items where id = $1", [itemId]);
  const shared = JSON.stringify(rows[0].data);
  for (const card of cards) assert.ok(!shared.includes(`"${card}"`), "a card turned up in the shared state");
});
