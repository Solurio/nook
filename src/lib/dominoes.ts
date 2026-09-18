// Dominoes on a double-six set. The line has two open ends and a tile joins it
// wherever its halves match, turning round if that is what it takes.

export type Tile = [number, number];
export type Line = Tile[];

export const MAX_PIP = 6;

/** All 28 tiles, from 0-0 up to 6-6. */
export function fullSet(): Tile[] {
  const out: Tile[] = [];
  for (let a = 0; a <= MAX_PIP; a += 1) {
    for (let b = a; b <= MAX_PIP; b += 1) out.push([a, b]);
  }
  return out;
}

export function sameTile(a: Tile, b: Tile): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

export function pips(tile: Tile): number {
  return tile[0] + tile[1];
}

export function handPips(hand: Tile[]): number {
  return hand.reduce((sum, tile) => sum + pips(tile), 0);
}

export function isDouble(tile: Tile): boolean {
  return tile[0] === tile[1];
}

/** The numbers showing at each end of the line. An empty line takes anything. */
export function openEnds(line: Line): { left: number; right: number } | null {
  if (line.length === 0) return null;
  return { left: line[0][0], right: line[line.length - 1][1] };
}

export type Side = "left" | "right";

/** Which ends this tile could join. An empty line accepts it either way. */
export function playableSides(line: Line, tile: Tile): Side[] {
  const ends = openEnds(line);
  if (!ends) return ["left"];

  const sides: Side[] = [];
  if (tile[0] === ends.left || tile[1] === ends.left) sides.push("left");
  if (tile[0] === ends.right || tile[1] === ends.right) sides.push("right");
  return sides;
}

/** The same tile the other way round. */
export function flip(tile: Tile): Tile {
  return [tile[1], tile[0]];
}

/**
 * The tile as it would actually come to rest at that end, matching half facing
 * the line. Null when it does not reach that end at all.
 *
 * This is what turning a domino in your hand amounts to: a tile that fits both
 * ends fits them the other way up, and seeing which way it lands is most of
 * deciding where to put it.
 */
export function orientFor(line: Line, tile: Tile, side: Side): Tile | null {
  const ends = openEnds(line);
  if (!ends) return tile;

  if (side === "left") {
    if (tile[1] === ends.left) return tile;
    if (tile[0] === ends.left) return flip(tile);
    return null;
  }

  if (tile[0] === ends.right) return tile;
  if (tile[1] === ends.right) return flip(tile);
  return null;
}

export function canPlayTile(line: Line, tile: Tile): boolean {
  return playableSides(line, tile).length > 0;
}

export function hasMove(line: Line, hand: Tile[]): boolean {
  return hand.some((tile) => canPlayTile(line, tile));
}

/**
 * Lays a tile down, turning it if needed so the touching halves match. Returns
 * null when it does not fit that end.
 */
export function place(line: Line, tile: Tile, side: Side): Line | null {
  const laid = orientFor(line, tile, side);
  if (!laid) return null;
  if (line.length === 0) return [laid];
  return side === "left" ? [laid, ...line] : [...line, laid];
}

export interface Standing {
  /** Seat ids in play order. */
  seats: string[];
  hands: Record<string, Tile[]>;
  teams: number;
}

export type DominoOutcome =
  | { kind: "playing" }
  | { kind: "out"; seat: string }
  | { kind: "blocked"; seat: string | null };

/**
 * Where the round stands. Someone emptying their hand ends it; so does nobody
 * being able to move, and then the lightest hand takes it. A tie on pips leaves
 * no winner.
 */
export function roundOutcome(line: Line, standing: Standing): DominoOutcome {
  for (const seat of standing.seats) {
    if ((standing.hands[seat] ?? []).length === 0) return { kind: "out", seat };
  }

  const stuck = standing.seats.every((seat) => !hasMove(line, standing.hands[seat] ?? []));
  if (!stuck) return { kind: "playing" };

  let best: string | null = null;
  let bestPips = Infinity;
  let tied = false;
  for (const seat of standing.seats) {
    const total = handPips(standing.hands[seat] ?? []);
    if (total < bestPips) {
      bestPips = total;
      best = seat;
      tied = false;
    } else if (total === bestPips) {
      tied = true;
    }
  }
  return { kind: "blocked", seat: tied ? null : best };
}

/**
 * Whoever opens. Traditionally the highest double leads, and with no double in
 * anyone's hand the heaviest tile does.
 */
export function opener(hands: Record<string, Tile[]>, seats: string[]): string | null {
  let bestSeat: string | null = null;
  let bestScore = -1;

  for (const seat of seats) {
    for (const tile of hands[seat] ?? []) {
      // Doubles outrank everything, then weight.
      const score = (isDouble(tile) ? 100 : 0) + pips(tile);
      if (score > bestScore) {
        bestScore = score;
        bestSeat = seat;
      }
    }
  }
  return bestSeat;
}

// ---------------------------------------------------------------------------
// Private hands
//
// The hands and the boneyard live in secret piles, not in the table's state:
// the boneyard belongs to nobody, each hand to whoever sits in that chair (or
// to whoever dealt, for an empty chair on a phone passed round). What the
// table shares is the line, whose go it is, and how many tiles each pile holds.
// ---------------------------------------------------------------------------

export const DEAL_EACH = 7;
export const BONEYARD = "boneyard";

export function handSlot(chair: string): string {
  return `hand:${chair}`;
}

export function chairOfSlot(slot: string): string | null {
  return slot.startsWith("hand:") ? slot.slice(5) : null;
}

/**
 * Where each hand goes when dealing: seven tiles to every chair, owned by the
 * person in it. Nothing here names a tile -- the database takes them off the
 * top of a boneyard it shuffled itself.
 */
export function dealTargets(
  chairs: string[],
  holders: Record<string, string | null> | undefined,
  dealer: string,
): Array<{ slot: string; owner: string; count: number }> {
  return chairs.map((chair) => ({
    slot: handSlot(chair),
    owner: holders?.[chair] ?? dealer,
    count: DEAL_EACH,
  }));
}

/**
 * Who leads a round. The winner of the last one does, the way most tables
 * play it; the first round, or one that ended dead even, a chair at random.
 *
 * The classic "highest double leads" would need someone to know every hand,
 * which is exactly what nobody at this table can know any more.
 */
export function pickLead(
  chairs: string[],
  lastWinner: string | null | undefined,
  random: () => number = Math.random,
): string {
  if (lastWinner && chairs.includes(lastWinner)) return lastWinner;
  return chairs[Math.floor(random() * chairs.length)] ?? chairs[0];
}

export interface PublicSizes {
  [slot: string]: { size: number } | undefined;
}

export type RoundStatus =
  | { kind: "idle" }
  | { kind: "playing" }
  | { kind: "out"; seat: string }
  /** Everyone passed; waiting on hands to be turned over to count them. */
  | { kind: "counting"; waitingOn: string[] }
  | { kind: "blocked"; seat: string | null };

/**
 * Where a round stands, worked out from what the whole table can see: pile
 * sizes, the number of passes in a row, and any hands turned over at the end.
 *
 * A hand at zero means someone went out. Every chair passing in turn means
 * nobody can move, and then the hands are shown and the lightest wins -- which
 * needs every hand shown first, so until then the round is counting.
 */
export function roundStatus(
  chairs: string[],
  piles: PublicSizes | undefined,
  passes: number,
  revealed: Record<string, unknown[]> | undefined,
): RoundStatus {
  if (!piles || !(BONEYARD in piles)) return { kind: "idle" };

  for (const chair of chairs) {
    if (piles[handSlot(chair)]?.size === 0) return { kind: "out", seat: chair };
  }

  if (passes < chairs.length) return { kind: "playing" };

  const waitingOn = chairs.filter((chair) => !revealed?.[handSlot(chair)]);
  if (waitingOn.length > 0) return { kind: "counting", waitingOn };

  let best: string | null = null;
  let bestPips = Infinity;
  let tied = false;
  for (const chair of chairs) {
    const total = handPips((revealed?.[handSlot(chair)] ?? []) as Tile[]);
    if (total < bestPips) {
      bestPips = total;
      best = chair;
      tied = false;
    } else if (total === bestPips) {
      tied = true;
    }
  }
  return { kind: "blocked", seat: tied ? null : best };
}

/** Round wins per chair, from the record of who took each round. */
export function tally(results: Record<string, string | null> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seat of Object.values(results ?? {})) {
    if (seat) out[seat] = (out[seat] ?? 0) + 1;
  }
  return out;
}

/**
 * The table's state with every trace of a hand taken out: the fields the old,
 * leaky version kept, and the pile metadata the database writes for itself.
 * Anything written back goes through this first.
 */
export function publicOnly<T extends object>(state: T): T {
  // Every field removed here is optional on the state, so the shape holds.
  const out = { ...state } as Record<string, unknown>;
  delete out.hands;
  delete out.boneyard;
  delete out.wins;
  delete out.piles;
  return out as T;
}

/**
 * What the table looks like after a tile goes down: the longer line, whose go
 * it is next, and -- if that was the last tile in the hand -- who took the
 * round. Null when the tile does not fit that end.
 */
export function afterPlay(
  table: { line: Line; turn: string; round?: number; results?: Record<string, string | null> },
  chairs: string[],
  tile: Tile,
  side: Side,
  handSize: number,
): { line: Line; passes: number; turn: string; results: Record<string, string | null> } | null {
  const line = place(table.line, tile, side);
  if (!line) return null;
  const out = handSize <= 1;
  const next = chairs[(chairs.indexOf(table.turn) + 1) % chairs.length];
  const results = table.results ?? {};
  return {
    line,
    passes: 0,
    turn: out ? table.turn : next,
    results: out ? { ...results, [String(table.round ?? 0)]: table.turn } : results,
  };
}
