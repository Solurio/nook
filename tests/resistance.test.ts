import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_REJECTIONS,
  MAX_SEATS,
  MIN_SEATS,
  MISSIONS,
  dealSpies,
  missionSucceeded,
  needsTwoFails,
  spyCount,
  teamSize,
  verdict,
  voteCarries,
  voteIsIn,
} from "../src/lib/resistance.ts";

const chairs = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

test("the spies are a minority at every table size", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    const spies = spyCount(players);
    assert.ok(spies * 2 < players, `${players} players had ${spies} spies`);
  }
  assert.equal(spyCount(5), 2);
  assert.equal(spyCount(6), 2);
  assert.equal(spyCount(7), 3);
  assert.equal(spyCount(9), 3);
  assert.equal(spyCount(10), 4);
});

test("a mission never needs more people than there are", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    for (let mission = 0; mission < MISSIONS; mission += 1) {
      const size = teamSize(players, mission);
      assert.ok(size >= 2 && size <= players, `${players}p mission ${mission + 1} sends ${size}`);
    }
  }
  assert.deepEqual(
    Array.from({ length: MISSIONS }, (_, m) => teamSize(5, m)),
    [2, 3, 2, 3, 3],
  );
  assert.deepEqual(
    Array.from({ length: MISSIONS }, (_, m) => teamSize(10, m)),
    [3, 4, 4, 5, 5],
  );
});

test("the fourth mission takes two saboteurs at a big table", () => {
  assert.equal(needsTwoFails(5, 3), false);
  assert.equal(needsTwoFails(6, 3), false);
  assert.equal(needsTwoFails(7, 3), true);
  assert.equal(needsTwoFails(10, 3), true);
  assert.equal(needsTwoFails(10, 2), false, "only the fourth");

  assert.equal(missionSucceeded(5, 3, 1), false, "one is enough at five players");
  assert.equal(missionSucceeded(7, 3, 1), true, "one is not enough at seven");
  assert.equal(missionSucceeded(7, 3, 2), false);
  assert.equal(missionSucceeded(7, 0, 1), false, "any other mission falls to one");
});

test("the spies dealt are the right number and all different people", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    const seats = chairs(players);
    const spies = dealSpies(seats);
    assert.equal(spies.length, spyCount(players));
    assert.equal(new Set(spies).size, spies.length);
    for (const spy of spies) assert.ok(seats.includes(spy));
  }
});

test("it is not the same people every game", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) seen.add(dealSpies(chairs(5)).join(","));
  assert.ok(seen.size > 1, "the deal never moved");
});

test("three missions settles it either way", () => {
  assert.equal(verdict([], 0), null);
  assert.equal(verdict([true, false, true], 0), null);
  assert.equal(verdict([true, true, true], 0), "resistance");
  assert.equal(verdict([false, false, false], 0), "spies");
  assert.equal(verdict([true, false, true, false, true], 0), "resistance");
});

test("a table that agrees on nobody hands it to the spies", () => {
  assert.equal(verdict([], MAX_REJECTIONS - 1), null);
  assert.equal(verdict([], MAX_REJECTIONS), "spies");
});

test("it takes a majority to send a team out", () => {
  const five = chairs(5);
  const all = (yes: number) =>
    Object.fromEntries(five.map((chair, i) => [chair, i < yes])) as Record<string, boolean>;

  assert.equal(voteCarries(all(3), five), true);
  assert.equal(voteCarries(all(2), five), false);

  const six = chairs(6);
  const split = Object.fromEntries(six.map((chair, i) => [chair, i < 3]));
  assert.equal(voteCarries(split, six), false, "a dead heat is a refusal");
});

test("the vote waits for everyone, including the people who abstained by not voting", () => {
  const five = chairs(5);
  assert.equal(voteIsIn({ s0: true, s1: false }, five), false);
  assert.equal(
    voteIsIn({ s0: true, s1: false, s2: true, s3: true, s4: false }, five),
    true,
  );
});

// ---------------------------------------------------------------------------
// Private roles, sealed votes, anonymous missions
// ---------------------------------------------------------------------------

import { before } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  ROLES,
  SPY,
  allCommitted,
  missionPool,
  playSlot,
  readFails,
  readSpies,
  readVotes,
  roleSlot,
  rolePool,
  teamSlot,
  voteSlot,
} from "../src/lib/resistance.ts";

test("the role pool has the right number of spies", () => {
  for (let n = MIN_SEATS; n <= MAX_SEATS; n += 1) {
    const pool = rolePool(n);
    assert.equal(pool.length, n);
    assert.equal(pool.filter((r) => r === SPY).length, spyCount(n));
  }
});

test("a vote is only in once everyone has something in their pile", () => {
  const slots = [voteSlot(0, "s0"), voteSlot(0, "s1")];
  assert.equal(allCommitted({ [slots[0]]: { size: 1 }, [slots[1]]: { size: 0 } }, slots), false);
  assert.equal(allCommitted({ [slots[0]]: { size: 1 }, [slots[1]]: { size: 1 } }, slots), true);
  assert.equal(allCommitted({}, []), false, "an empty list is not a finished vote");
});

test("votes are read by name, and only once every one is showing", () => {
  const chairs = ["s0", "s1", "s2"];
  const shown = { [voteSlot(3, "s0")]: [true], [voteSlot(3, "s1")]: [false] };
  assert.equal(readVotes(shown, 3, chairs), null);
  assert.deepEqual(readVotes({ ...shown, [voteSlot(3, "s2")]: [true] }, 3, chairs), { s0: true, s1: false, s2: true });
  assert.equal(readVotes({ [voteSlot(2, "s0")]: [true] }, 3, ["s0"]), null, "an old vote is never read as this one");
});

test("a mission is read as a count of fails", () => {
  assert.equal(readFails({ [missionPool(1)]: ["success", "fail", "success"] }, 1), 1);
  assert.equal(readFails({}, 1), null);
});

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("a game: spies know each other, votes stay sealed, a mission never says who failed", async () => {
  const people = await Promise.all(Array.from({ length: 5 }, () => newUser(db)));
  const chairs = ["s0", "s1", "s2", "s3", "s4"];
  const { itemId } = await tableFor(db, people[0], "resistance");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const read = async (user: string) => {
    const { rows } = await run(user, "select slot, cards from public.secrets where item_id = $1", [itemId]);
    return Object.fromEntries((rows as Array<{ slot: string; cards: unknown[] }>).map((r) => [r.slot, r.cards]));
  };
  const state = async () =>
    ((await db.query<{ data: { state: Record<string, unknown> } }>("select data from public.items where id = $1", [itemId])).rows[0].data.state);

  await run(people[0], "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([{ slot: ROLES, cards: rolePool(5), shuffle: true }]),
  ]);
  await run(people[0], "select public.pile_deal(p_item => $1, p_from => $2, p_targets => $3::jsonb)", [
    itemId,
    ROLES,
    JSON.stringify(chairs.map((c, i) => ({ slot: roleSlot(c), owner: people[i], count: 1 }))),
  ]);
  await run(people[0], "select public.pile_team(p_item => $1, p_prefix => 'role:', p_card => $2::jsonb, p_to_prefix => 'team:')", [
    itemId,
    JSON.stringify(SPY),
  ]);

  const roles = await Promise.all(people.map(read));
  const spies = chairs.filter((c, i) => roles[i][roleSlot(c)]?.[0] === SPY);
  assert.equal(spies.length, 2);
  for (const [i, chair] of chairs.entries()) {
    assert.equal(Object.keys(roles[i]).includes(roleSlot(chair)), true);
    const others = chairs.filter((c) => c !== chair).map(roleSlot);
    for (const slot of others) assert.equal(roles[i][slot], undefined, `${chair} can read ${slot}`);
    if (spies.includes(chair)) assert.deepEqual(roles[i][teamSlot(chair)], spies, "a spy knows the other spy");
    else assert.equal(roles[i][teamSlot(chair)], undefined, "a rebel is told nothing");
  }

  // Everyone votes; nobody can turn the votes over until the last is in.
  const seal = JSON.stringify(chairs.map((c) => voteSlot(0, c)));
  for (const [i, chair] of chairs.entries()) {
    if (i === 4) {
      await assert.rejects(
        run(people[0], "select public.pile_reveal(p_item => $1, p_slots => $2)", [itemId, chairs.map((c) => voteSlot(0, c))]),
        /committed/,
      );
    }
    await run(people[i], "select public.pile_put(p_item => $1, p_to => $2, p_cards => $3::jsonb, p_to_owner => $4, p_seal => $5::jsonb)", [
      itemId,
      voteSlot(0, chair),
      JSON.stringify([i !== 2]),
      people[i],
      seal,
    ]);
  }
  await run(people[3], "select public.pile_reveal(p_item => $1, p_slots => $2)", [itemId, chairs.map((c) => voteSlot(0, c))]);
  assert.deepEqual(readVotes((await state()).revealed as Record<string, unknown[]>, 0, chairs), {
    s0: true, s1: true, s2: false, s3: true, s4: true,
  });

  // A two-person mission: one spy fails it. The table learns one failed, not who.
  const team = [spies[0], chairs.find((c) => !spies.includes(c)) as string];
  const missionSeal = JSON.stringify(team.map((c) => playSlot(0, c)));
  for (const chair of team) {
    const i = chairs.indexOf(chair);
    await run(people[i], "select public.pile_put(p_item => $1, p_to => $2, p_cards => $3::jsonb, p_to_owner => $4, p_seal => $5::jsonb)", [
      itemId,
      playSlot(0, chair),
      JSON.stringify([spies.includes(chair) ? "fail" : "success"]),
      people[i],
      missionSeal,
    ]);
  }
  await run(people[1], "select public.pile_reveal(p_item => $1, p_slots => $2, p_pool => $3)", [
    itemId,
    team.map((c) => playSlot(0, c)),
    missionPool(0),
  ]);
  const shown = (await state()).revealed as Record<string, unknown[]>;
  assert.equal(readFails(shown, 0), 1);
  for (const chair of team) assert.equal(shown[playSlot(0, chair)], undefined, "a mission card was shown by name");

  // At the end each player turns their own role over; nobody can do it for them.
  await assert.rejects(
    run(people[0], "select public.pile_reveal(p_item => $1, p_slots => $2, p_keep => true)", [itemId, [roleSlot("s1")]]),
  );
  for (const [i, chair] of chairs.entries()) {
    await run(people[i], "select public.pile_reveal(p_item => $1, p_slots => $2, p_keep => true)", [itemId, [roleSlot(chair)]]);
  }
  assert.deepEqual(readSpies((await state()).revealed as Record<string, unknown[]>, chairs).spies.sort(), [...spies].sort());
});
