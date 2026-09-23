import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  FLEET,
  FLEET_SQUARES,
  afterShot,
  cellAt,
  cellsOf,
  emptyBattleship,
  fitsWith,
  fleetCards,
  fleetProblem,
  fleetSlot,
  newlySunk,
  randomFleet,
  ready,
  shipsIn,
  type Placement,
} from "../src/lib/battleship.ts";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

const neat: Placement[] = FLEET.map((kind, i) => ({ ship: kind.id, row: i * 2, col: 0, across: true }));

test("a ship covers its squares, and cannot hang off the edge", () => {
  assert.deepEqual(cellsOf({ ship: "destroyer", row: 0, col: 0, across: true }), ["A1", "B1"]);
  assert.deepEqual(cellsOf({ ship: "cruiser", row: 7, col: 9, across: false }), ["J8", "J9", "J10"]);
  assert.equal(cellsOf({ ship: "carrier", row: 0, col: 7, across: true }), null);
  assert.deepEqual(cellAt("J10"), { row: 9, col: 9 });
  assert.equal(cellAt("K1"), null);
});

test("a fleet has every ship, all on the board, none on top of another", () => {
  assert.equal(fleetProblem(neat), null);
  assert.match(fleetProblem(neat.slice(1)) ?? "", /carrier/);
  const crossed = neat.map((p) => (p.ship === "destroyer" ? { ...p, row: 0 } : p));
  assert.match(fleetProblem(crossed) ?? "", /runs into/);
  assert.equal(fitsWith(neat, { ship: "destroyer", row: 0, col: 3, across: false }), false);
});

test("a fleet thrown out at random always fits", () => {
  for (let seed = 1; seed < 40; seed += 1) {
    assert.equal(fleetProblem(randomFleet(seeded(seed))), null, `seed ${seed}`);
  }
});

test("the pile holds the seventeen squares and a line per ship that no square can match", () => {
  const cards = fleetCards(neat);
  assert.equal(cards.length, FLEET_SQUARES + FLEET.length);
  assert.ok(cards.includes("E1"));
  const ships = shipsIn(cards);
  assert.equal(ships.length, 5);
  assert.deepEqual(ships.find((s) => s.ship === "carrier")?.cells, ["A1", "B1", "C1", "D1", "E1"]);
});

test("a miss hands the guns over; a hit only keeps them when the table says so", () => {
  const state = emptyBattleship();
  assert.equal(afterShot(state, "a", "C3", false).turn, "b");
  assert.equal(afterShot(state, "a", "C3", true).turn, "b");
  assert.equal(afterShot({ ...state, again: true }, "a", "C3", true).turn, "a");
  const twice = afterShot(afterShot(state, "a", "C3", false), "a", "C3", false);
  assert.equal(twice.shots.a.length, 1, "the same square is not shot twice");
});

test("seventeen hits sink the lot", () => {
  let state = { ...emptyBattleship(), again: true };
  const squares = fleetCards(neat).slice(0, FLEET_SQUARES);
  for (const cell of squares) state = afterShot(state, "a", cell, true);
  assert.equal(state.winner, "a");
});

test("a ship is announced as sunk once, when its last square is hit", () => {
  const ships = shipsIn(fleetCards(neat));
  const halfway = ["A3", "B3"].map((cell) => ({ cell, hit: true }));
  assert.deepEqual(newlySunk(ships, halfway, []), [], "two squares of the battleship are not the battleship");
  const destroyer = neat.find((p) => p.ship === "destroyer") as Placement;
  const hits = (cellsOf(destroyer) ?? []).map((cell) => ({ cell, hit: true }));
  assert.deepEqual(newlySunk(ships, hits, []).map((s) => s.ship), ["destroyer"]);
  assert.deepEqual(newlySunk(ships, hits, [{ ship: "destroyer", cells: [] }]), [], "not twice");
});

// ---------------------------------------------------------------------------
// Against the database: nobody reads the other fleet, and a shot tells the truth
// ---------------------------------------------------------------------------

let db: PGlite;
let alice: string;
let bob: string;

before(async () => {
  db = await freshDatabase();
  alice = await newUser(db);
  bob = await newUser(db);
});

test("a shot asks the database, which answers without showing the fleet", async () => {
  const { itemId } = await tableFor(db, alice, "battleship");
  const cards = fleetCards(neat);
  await as(db, bob, (tx) =>
    tx.query("select public.pile_put(p_item => $1, p_to => $2, p_cards => $3::jsonb, p_to_owner => $4)", [
      itemId,
      fleetSlot("b"),
      JSON.stringify(cards),
      bob,
    ]),
  );

  // Alice cannot read Bob's waters.
  const peek = await as(db, alice, (tx) => tx.query<{ slot: string }>("select slot from public.secrets where item_id = $1", [itemId]));
  assert.equal(peek.rows.length, 0);

  const shoot = async (cell: string) => {
    const { rows } = await as(db, alice, (tx) =>
      tx.query<{ out: boolean }>("select public.pile_test(p_item => $1, p_slot => $2, p_card => $3::jsonb) as out", [
        itemId,
        fleetSlot("b"),
        JSON.stringify(cell),
      ]),
    );
    return rows[0].out;
  };
  assert.equal(await shoot("A1"), true, "the carrier is there");
  assert.equal(await shoot("J10"), false, "open water");
  // The line naming a ship's squares is never a square itself.
  assert.equal(await shoot("carrier:A1,B1,C1,D1,E1"), true, "an exact line is found, but nobody aims at one");

  const { rows } = await db.query<{ data: { state: { piles?: Record<string, { size: number }>; tested?: Array<{ card: string; found: boolean }> } } }>(
    "select data from public.items where id = $1",
    [itemId],
  );
  const state = rows[0].data.state;
  assert.equal(ready(state.piles as never, "b"), true, "the size says the fleet is out, and nothing else");
  assert.deepEqual(
    state.tested?.slice(-3).map((t) => [t.card, t.found]),
    [["A1", true], ["J10", false], ["carrier:A1,B1,C1,D1,E1", true]],
  );
});
