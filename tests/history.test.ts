import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_LIMIT, SAME_STEP_MS, TYPING_STEP_MS, describe, inverse, invert, record, type Op, type Step } from "../src/lib/history.ts";
import type { AnyItem, Stroke } from "../src/lib/types.ts";

const item = (id: string) => ({ id, kind: "note", x: 0, y: 0, width: 10, height: 10, rotation: 0, z: 1, data: { body: "" } }) as unknown as AnyItem;
const box = (x: number) => ({ x, y: 0, width: 10, height: 10, rotation: 0 });
const stroke = { id: "s1", room_id: "r", color: "#fff", size: 3, points: [0, 0, 1, 1], created_by: "me", created_at: "" } as Stroke;

test("every operation has an opposite, and the opposite of that is where it started", () => {
  const ops: Op[] = [
    { kind: "create", item: item("a") },
    { kind: "delete", item: item("a") },
    { kind: "move", id: "a", before: box(0), after: box(5) },
    { kind: "data", id: "a", before: { body: "x" }, after: { body: "xy" } },
    { kind: "stack", id: "a", before: 1, after: 4 },
    { kind: "ink", stroke },
    { kind: "rub", stroke },
  ];
  for (const op of ops) assert.deepEqual(invert(invert(op)), op);
  assert.equal(invert(ops[0]).kind, "delete");
  assert.deepEqual(invert(ops[2]), { kind: "move", id: "a", before: box(5), after: box(0) });
});

test("a step goes back last thing first", () => {
  const step: Step = { ops: [{ kind: "create", item: item("a") }, { kind: "move", id: "a", before: box(0), after: box(9) }], at: 0 };
  assert.deepEqual(
    inverse(step).ops.map((o) => o.kind),
    ["move", "delete"],
  );
});

test("things done together are one step; things done apart are two", () => {
  let past: Step[] = [];
  past = record(past, { kind: "delete", item: item("a") }, 1000);
  past = record(past, { kind: "delete", item: item("b") }, 1000 + 10);
  assert.equal(past.length, 1, "a pile removed at once");
  assert.equal(past[0].ops.length, 2);
  past = record(past, { kind: "create", item: item("c") }, 1000 + 10 + SAME_STEP_MS + 1);
  assert.equal(past.length, 2);
  assert.equal(describe(past[0]), "removing those");
  assert.equal(describe(past[1]), "adding that");
});

test("typing into the same note undoes as one edit, from where it started", () => {
  let past: Step[] = [];
  past = record(past, { kind: "data", id: "n", before: { body: "" }, after: { body: "h" } }, 0);
  past = record(past, { kind: "data", id: "n", before: { body: "h" }, after: { body: "hello" } }, 900);
  assert.equal(past.length, 1);
  assert.deepEqual(past[0].ops[0], { kind: "data", id: "n", before: { body: "" }, after: { body: "hello" } });
  past = record(past, { kind: "data", id: "n", before: { body: "hello" }, after: { body: "hello!" } }, 900 + TYPING_STEP_MS + 1);
  assert.equal(past.length, 2, "after a pause, a new edit");
  past = record(past, { kind: "data", id: "other", before: {}, after: { body: "x" } }, 900 + TYPING_STEP_MS + 200);
  assert.equal(past.length, 3, "another note is another edit");
});

test("the same thing nudged again in a moment is one move", () => {
  let past: Step[] = [];
  past = record(past, { kind: "move", id: "a", before: box(0), after: box(1) }, 0);
  past = record(past, { kind: "move", id: "a", before: box(1), after: box(2) }, 100);
  assert.deepEqual(past, [{ ops: [{ kind: "move", id: "a", before: box(0), after: box(2) }], at: 100 }]);
});

test("the history keeps the last hundred steps", () => {
  let past: Step[] = [];
  for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) past = record(past, { kind: "stack", id: `i${i}`, before: 0, after: 1 }, i * (SAME_STEP_MS + 1));
  assert.equal(past.length, HISTORY_LIMIT);
  assert.equal((past[0].ops[0] as { id: string }).id, "i20");
});

test("one thing handed from one piece to another undoes as one step", () => {
  let past: Step[] = [];
  past = record(past, { kind: "data", id: "a", before: { bag: [1] }, after: { bag: [] } }, 5000);
  past = record(past, { kind: "data", id: "b", before: { bag: [] }, after: { bag: [1] } }, 5001);
  assert.equal(past.length, 1);
  assert.deepEqual(
    inverse(past[0]).ops.map((o) => (o as { id: string }).id),
    ["b", "a"],
  );
});
