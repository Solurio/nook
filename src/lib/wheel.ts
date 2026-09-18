// A wheel of fortune with weights. Every slice is drawn as big as its chance of
// coming up, so what you see is what you get: a slice weighted three is three
// times the width of a slice weighted one, and three times as likely.
//
// The wheel keeps its angle. A spin works out where it will stop first -- a
// weighted pick, then a random spot inside that slice -- and turns the wheel
// forward by a few whole turns plus whatever lands the pointer there, so every
// screen watching runs the same animation to the same place.

import { randomBelow, type Random } from "./dice";

export interface Slice {
  id: string;
  label: string;
  weight: number;
  color: string;
  /** Taken out after winning, when the wheel is set to do that. */
  out?: boolean;
}

export interface WheelSpin {
  id: string;
  by: string;
  slice: string;
  label: string;
  at: number;
}

export interface WheelState {
  title: string;
  slices: Slice[];
  /** Total clockwise turn so far, in degrees. Only ever goes up. */
  angle: number;
  spin: WheelSpin | null;
  history: WheelSpin[];
  /** Winners sit out the next spins, for drawing an order or a name from a hat. */
  removeWinners: boolean;
}

export const PALETTE = [
  "#c4a7f0",
  "#f6c177",
  "#8bc7e8",
  "#e0655c",
  "#a6d189",
  "#f2a4b8",
  "#8fd3c8",
  "#e8b86a",
  "#9aa6f0",
  "#d98fd0",
  "#b8d86a",
  "#f08f6a",
];

export const MAX_SLICES = 24;
export const MAX_WEIGHT = 99;
export const LABEL_MAX = 24;
export const HISTORY = 20;
/** How long the wheel takes to stop, in milliseconds. */
export const SPIN_MS = 4200;

export function emptyWheel(): WheelState {
  return {
    title: "",
    slices: ["yes", "no", "maybe", "ask again"].map((label, i) => ({
      id: `w${i}`,
      label,
      weight: 1,
      color: PALETTE[i],
    })),
    angle: 0,
    spin: null,
    history: [],
    removeWinners: false,
  };
}

export const inPlay = (slices: Slice[]) => slices.filter((s) => !s.out && s.weight > 0);

export interface Arc {
  slice: Slice;
  /** Degrees clockwise from the top of the wheel. */
  start: number;
  end: number;
}

/** Where each slice sits on the wheel, sized by weight. */
export function arcs(slices: Slice[]): Arc[] {
  const live = inPlay(slices);
  const total = live.reduce((sum, s) => sum + s.weight, 0);
  if (total <= 0) return [];
  let at = 0;
  return live.map((slice) => {
    const start = at;
    at += (slice.weight / total) * 360;
    return { slice, start, end: at };
  });
}

/** The chance of each slice, as a fraction. */
export function chance(slices: Slice[], id: string): number {
  const live = inPlay(slices);
  const total = live.reduce((sum, s) => sum + s.weight, 0);
  const slice = live.find((s) => s.id === id);
  return slice && total > 0 ? slice.weight / total : 0;
}

/**
 * A weighted pick. Weights are whole numbers, so this draws a ticket from a
 * hat with that many tickets in it -- exact, with no floating point to lean
 * one way.
 */
export function pick(slices: Slice[], random: Random = randomBelow): Slice | null {
  const live = inPlay(slices);
  const total = live.reduce((sum, s) => sum + s.weight, 0);
  if (total <= 0) return null;
  let ticket = random(total);
  for (const slice of live) {
    if (ticket < slice.weight) return slice;
    ticket -= slice.weight;
  }
  return live[live.length - 1];
}

/** Which slice sits under the pointer at the top when the wheel is turned this far. */
export function under(slices: Slice[], angle: number): Slice | null {
  const at = (((-angle % 360) + 360) % 360);
  const found = arcs(slices).find((arc) => at >= arc.start && at < arc.end);
  return found?.slice ?? null;
}

export function spin(state: WheelState, by: string, id: string, now: number, random: Random = randomBelow): WheelState {
  const winner = pick(state.slices, random);
  if (!winner) return state;
  const arc = arcs(state.slices).find((a) => a.slice.id === winner.id) as Arc;
  // Somewhere inside the slice, clear of its edges, so nobody squints at a
  // pointer sitting on a line.
  const width = arc.end - arc.start;
  const margin = width * 0.18;
  const spot = arc.start + margin + (random(1000) / 1000) * (width - margin * 2);
  const current = ((state.angle % 360) + 360) % 360;
  const needed = (((-spot - current) % 360) + 360) % 360;
  const turns = 4 + random(3);
  const angle = state.angle + turns * 360 + needed;

  const entry: WheelSpin = { id, by, slice: winner.id, label: winner.label, at: now };
  return {
    ...state,
    angle,
    spin: entry,
    history: [entry, ...state.history].slice(0, HISTORY),
  };
}

/**
 * Called once the wheel has stopped: with winners sitting out, the one it
 * landed on leaves the wheel.
 */
export function settle(state: WheelState): WheelState {
  if (!state.removeWinners || !state.spin) return state;
  const id = state.spin.slice;
  if (state.slices.find((s) => s.id === id)?.out) return state;
  // Never empty the wheel entirely: the last slice stays.
  if (inPlay(state.slices).length <= 1) return state;
  return { ...state, slices: state.slices.map((s) => (s.id === id ? { ...s, out: true } : s)) };
}

export function addSlice(state: WheelState, id: string, label = ""): WheelState {
  if (state.slices.length >= MAX_SLICES) return state;
  const used = new Set(state.slices.map((s) => s.color));
  const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[state.slices.length % PALETTE.length];
  return {
    ...state,
    slices: [...state.slices, { id, label: label.slice(0, LABEL_MAX), weight: 1, color }],
  };
}

export function editSlice(state: WheelState, id: string, patch: Partial<Omit<Slice, "id">>): WheelState {
  return {
    ...state,
    slices: state.slices.map((s) =>
      s.id === id
        ? {
            ...s,
            ...patch,
            ...(patch.label !== undefined ? { label: patch.label.slice(0, LABEL_MAX) } : {}),
            ...(patch.weight !== undefined
              ? { weight: Math.max(1, Math.min(MAX_WEIGHT, Math.round(patch.weight))) }
              : {}),
          }
        : s,
    ),
  };
}

export function removeSlice(state: WheelState, id: string): WheelState {
  if (state.slices.length <= 1) return state;
  return { ...state, slices: state.slices.filter((s) => s.id !== id) };
}

export function putBack(state: WheelState): WheelState {
  return { ...state, slices: state.slices.map((s) => (s.out ? { ...s, out: false } : s)) };
}
