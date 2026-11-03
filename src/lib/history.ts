// Undo for the room: what you did, and how to take it back.
//
// Only your own doing, from this visit. Each step is a handful of operations
// recorded as the room writes them -- an item made, removed, moved, restacked
// or edited, a line drawn or rubbed out -- and undoing one is writing its
// inverse the ordinary way, so everyone else sees it go back too.
//
// Games are left out of it on purpose: a move in a game is a move, and a hand
// dealt from a hidden deck cannot be dealt back. Their items can still be
// brought back if you remove one by mistake, starting over.

import type { AnyItem, ItemKind, Stroke } from "./types";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export type Op =
  | { kind: "create"; item: AnyItem }
  | { kind: "delete"; item: AnyItem }
  | { kind: "move"; id: string; before: Box; after: Box }
  | { kind: "data"; id: string; before: unknown; after: unknown }
  | { kind: "stack"; id: string; before: number; after: number }
  | { kind: "ink"; stroke: Stroke }
  | { kind: "rub"; stroke: Stroke };

export interface Step {
  ops: Op[];
  /** When it was last added to, for folding what follows straight on into it. */
  at: number;
}

/** Steps kept; the oldest go first. */
export const HISTORY_LIMIT = 100;
/** Things recorded this close together are one step: a group dragged, a pile removed. */
export const SAME_STEP_MS = 400;
/** Edits to different things this close together came from one action. */
export const SAME_TICK_MS = 40;
/** Edits to the same note this close together are one step, so a sentence undoes as a sentence. */
export const TYPING_STEP_MS = 2500;

/** Kinds whose content is yours to undo. The rest are players, windows and games, which keep their own time. */
export const UNDOABLE_DATA: ReadonlySet<ItemKind> = new Set<ItemKind>(["note", "text", "image", "token", "grid"]);

export function boxOf(item: Pick<AnyItem, "x" | "y" | "width" | "height" | "rotation">): Box {
  return { x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation };
}

export function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.rotation === b.rotation;
}

export function invert(op: Op): Op {
  switch (op.kind) {
    case "create":
      return { kind: "delete", item: op.item };
    case "delete":
      return { kind: "create", item: op.item };
    case "move":
      return { kind: "move", id: op.id, before: op.after, after: op.before };
    case "data":
      return { kind: "data", id: op.id, before: op.after, after: op.before };
    case "stack":
      return { kind: "stack", id: op.id, before: op.after, after: op.before };
    case "ink":
      return { kind: "rub", stroke: op.stroke };
    case "rub":
      return { kind: "ink", stroke: op.stroke };
  }
}

/** A step taken back: every operation inverted, last first. */
export function inverse(step: Step): Step {
  return { ops: step.ops.map(invert).reverse(), at: step.at };
}

/**
 * Adds an operation to the history: into the last step when it follows
 * straight on from it, otherwise as a step of its own. Anything that could
 * have been redone is gone once something new is done.
 */
export function record(past: Step[], op: Op, now: number): Step[] {
  const last = past.at(-1);
  if (last && op.kind === "data") {
    // More typing into the same note: keep where it started, take where it got to.
    const same = last.ops.length === 1 && last.ops[0].kind === "data" && last.ops[0].id === op.id;
    if (same && now - last.at < TYPING_STEP_MS) {
      const first = last.ops[0] as Extract<Op, { kind: "data" }>;
      return [...past.slice(0, -1), { ops: [{ ...first, after: op.after }], at: now }];
    }
  }
  if (last && op.kind === "data" && now - last.at < SAME_TICK_MS && last.ops.every((o) => o.kind === "data" && o.id !== op.id)) {
    // Two things changed by one action -- something handed from one piece to another.
    return [...past.slice(0, -1), { ops: [...last.ops, op], at: now }];
  }
  if (last && op.kind === "move") {
    // The same thing moved again within the moment: one move.
    const index = last.ops.findIndex((o) => o.kind === "move" && o.id === op.id);
    if (index >= 0 && now - last.at < SAME_STEP_MS) {
      const ops = last.ops.slice();
      const was = ops[index] as Extract<Op, { kind: "move" }>;
      ops[index] = { ...was, after: op.after };
      return [...past.slice(0, -1), { ops, at: now }];
    }
  }
  if (last && op.kind !== "data" && now - last.at < SAME_STEP_MS && !last.ops.some((o) => o.kind === "data")) {
    return [...past.slice(0, -1), { ops: [...last.ops, op], at: now }];
  }
  return [...past, { ops: [op], at: now }].slice(-HISTORY_LIMIT);
}

/** What a step did, in a few words, for the button's tooltip. */
export function describe(step: Step | undefined): string {
  if (!step) return "";
  const kinds = new Set(step.ops.map((o) => o.kind));
  if (kinds.size > 1) return "the last change";
  const [kind] = kinds;
  const many = step.ops.length > 1;
  switch (kind) {
    case "create":
      return many ? "adding those" : "adding that";
    case "delete":
      return many ? "removing those" : "removing that";
    case "move":
      return many ? "moving those" : "moving that";
    case "data":
      return "that edit";
    case "stack":
      return "the reordering";
    case "ink":
      return "that line";
    case "rub":
      return "the rubbing out";
    default:
      return "the last change";
  }
}
