import { test } from "node:test";
import assert from "node:assert/strict";
import {
  again,
  blocked,
  distanceHome,
  hasPath,
  movePawn,
  newGame,
  pawnMoves,
  placeWall,
  sideOf,
  wallProblem,
  type Cell,
  type QuoridorState,
  type Wall,
} from "../src/lib/quoridor.ts";

const cells = (list: Cell[]) => list.map((c) => `${c.x},${c.y}`).sort();
const at = (state: QuoridorState, pawns: Record<string, Cell>, walls: Wall[] = []): QuoridorState => ({
  ...state,
  pawns: { ...state.pawns, ...pawns },
  walls,
});

test("setting up: two players get ten walls each, four get five, pawns in the middle of their edge", () => {
  const two = newGame(2);
  assert.deepEqual(two.left, { s0: 10, s1: 10 });
  assert.deepEqual(two.pawns, { s0: { x: 4, y: 8 }, s1: { x: 4, y: 0 } });
  const four = newGame(4);
  assert.deepEqual(four.left, { s0: 5, s1: 5, s2: 5, s3: 5 });
  assert.deepEqual(four.pawns.s1, { x: 0, y: 4 });
  assert.deepEqual(four.pawns.s3, { x: 8, y: 4 });
  assert.deepEqual(["s0", "s1", "s2", "s3"].map((c) => sideOf(4, c)), ["bottom", "left", "top", "right"]);
});

test("a wall blocks the two squares it runs along, and no others", () => {
  const flat: Wall[] = [{ x: 3, y: 4, o: "h" }];
  assert.ok(blocked(flat, { x: 3, y: 4 }, { x: 3, y: 5 }));
  assert.ok(blocked(flat, { x: 4, y: 5 }, { x: 4, y: 4 }));
  assert.equal(blocked(flat, { x: 5, y: 4 }, { x: 5, y: 5 }), false);
  assert.equal(blocked(flat, { x: 3, y: 4 }, { x: 4, y: 4 }), false);
  const standing: Wall[] = [{ x: 3, y: 4, o: "v" }];
  assert.ok(blocked(standing, { x: 3, y: 4 }, { x: 4, y: 4 }));
  assert.ok(blocked(standing, { x: 4, y: 5 }, { x: 3, y: 5 }));
  assert.equal(blocked(standing, { x: 3, y: 6 }, { x: 4, y: 6 }), false);
});

test("a pawn steps one square, never through a wall or off the board", () => {
  const state = newGame(2);
  assert.deepEqual(cells(pawnMoves(state, "s0")), ["3,8", "4,7", "5,8"]);
  const walled = at(state, {}, [{ x: 3, y: 7, o: "h" }]);
  assert.deepEqual(cells(pawnMoves(walled, "s0")), ["3,8", "5,8"]);
});

test("face to face, a pawn jumps; with a wall behind, it goes aside", () => {
  const base = at(newGame(2), { s0: { x: 4, y: 5 }, s1: { x: 4, y: 4 } });
  assert.ok(cells(pawnMoves(base, "s0")).includes("4,3"));
  assert.ok(!cells(pawnMoves(base, "s0")).includes("4,4"));
  const wallBehind = at(base, {}, [{ x: 4, y: 3, o: "h" }]);
  const moves = cells(pawnMoves(wallBehind, "s0"));
  assert.ok(!moves.includes("4,3"));
  assert.ok(moves.includes("3,4") && moves.includes("5,4"));
  // At the edge, the same.
  const edge = at(newGame(2), { s0: { x: 4, y: 1 }, s1: { x: 4, y: 0 } });
  assert.ok(cells(pawnMoves(edge, "s0")).includes("3,0") && cells(pawnMoves(edge, "s0")).includes("5,0"));
});

test("with four, you never jump two pawns at once", () => {
  const state = at(newGame(4), { s0: { x: 4, y: 6 }, s2: { x: 4, y: 5 }, s1: { x: 4, y: 4 } });
  const moves = cells(pawnMoves(state, "s0"));
  assert.ok(!moves.includes("4,4") && !moves.includes("4,3"));
  assert.ok(moves.includes("3,5") && moves.includes("5,5"), "blocked straight, so aside");
});

test("walls may not overlap, cross, run off the board, or shut anyone in", () => {
  const state = placeWall(newGame(2), { x: 3, y: 3, o: "h" });
  assert.equal(state.left.s0, 9);
  assert.equal(state.turn, "s1");
  assert.match(wallProblem(state, "s1", { x: 3, y: 3, o: "v" }) ?? "", /cross/);
  assert.match(wallProblem(state, "s1", { x: 4, y: 3, o: "h" }) ?? "", /overlap/);
  assert.equal(wallProblem(state, "s1", { x: 5, y: 3, o: "h" }), null);
  assert.match(wallProblem(state, "s1", { x: 8, y: 3, o: "h" }) ?? "", /off/);
  // Box the top pawn in against its edge: the last wall is refused.
  const boxed = at(newGame(2), {}, [
    { x: 2, y: 0, o: "v" },
    { x: 5, y: 0, o: "v" },
    { x: 3, y: 1, o: "h" },
  ]);
  assert.ok(hasPath(boxed.walls, boxed.pawns.s1, "top"));
  assert.match(wallProblem(boxed, "s0", { x: 5, y: 1, o: "h" }) ?? "", /shut/);
  assert.equal(wallProblem({ ...state, left: { ...state.left, s1: 0 } }, "s1", { x: 0, y: 0, o: "h" }), "no walls left");
});

test("the first pawn across wins, and the next game opens with someone else", () => {
  let state = at(newGame(2), { s0: { x: 4, y: 1 }, s1: { x: 0, y: 0 } });
  state = movePawn(state, { x: 4, y: 0 });
  assert.equal(state.phase, "over");
  assert.equal(state.winner, "s0");
  assert.equal(state.wins.s0, 1);
  assert.equal(movePawn(state, { x: 4, y: 1 }), state);
  const next = again(state);
  assert.equal(next.turn, "s1");
  assert.equal(next.wins.s0, 1);
  assert.deepEqual(next.pawns.s0, { x: 4, y: 8 });
});

test("four players take turns round the board", () => {
  let state = newGame(4);
  const order: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    order.push(state.turn);
    state = movePawn(state, pawnMoves(state, state.turn)[0]);
  }
  assert.deepEqual(order, ["s0", "s1", "s2", "s3", "s0"]);
});

test("distance home counts the steps round the walls", () => {
  assert.equal(distanceHome([], { x: 4, y: 8 }, "bottom"), 8);
  // Two walls over x=3..6: out to x=2 first, two steps sideways.
  assert.equal(distanceHome([{ x: 3, y: 7, o: "h" }, { x: 5, y: 7, o: "h" }], { x: 4, y: 8 }, "bottom"), 8 + 2);
});
