// A coin to flip. The faces say whatever the room wants them to -- "heads" and
// "tails", "yes" and "no", two people's names -- and every flip is kept for a
// little while, with the run it is on, since the first thing anyone asks after
// three heads in a row is whether the coin is fair.

import { randomBelow, type Random } from "./dice";

export type Side = "heads" | "tails";
export type Metal = "gold" | "silver" | "copper" | "jade";

export const METALS: Metal[] = ["gold", "silver", "copper", "jade"];
export const LABEL_MAX = 10;
export const HISTORY = 24;

export interface CoinFlip {
  id: string;
  by: string;
  side: Side;
  /** Whole turns in the air before it lands; differs flip to flip so it never looks canned. */
  spins: number;
  at: number;
}

export interface CoinState {
  heads: string;
  tails: string;
  metal: Metal;
  flips: CoinFlip[];
  tally: Record<Side, number>;
}

export function emptyCoin(): CoinState {
  return { heads: "heads", tails: "tails", metal: "gold", flips: [], tally: { heads: 0, tails: 0 } };
}

export function flip(state: CoinState, by: string, id: string, now: number, random: Random = randomBelow): CoinState {
  const side: Side = random(2) === 0 ? "heads" : "tails";
  const entry: CoinFlip = { id, by, side, spins: 4 + random(3), at: now };
  return {
    ...state,
    flips: [entry, ...state.flips].slice(0, HISTORY),
    tally: { ...state.tally, [side]: state.tally[side] + 1 },
  };
}

/** The side the latest flips keep landing on, and how many in a row. */
export function streak(flips: CoinFlip[]): { side: Side; length: number } | null {
  if (flips.length === 0) return null;
  const side = flips[0].side;
  let length = 0;
  while (length < flips.length && flips[length].side === side) length += 1;
  return { side, length };
}

/** A face's text, trimmed to fit on the coin. Empty falls back to the side's name. */
export function faceLabel(text: string, side: Side): string {
  const clean = text.trim().slice(0, LABEL_MAX);
  return clean || side;
}
