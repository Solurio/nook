// Battleship, with the fleets kept where nobody can read them.
//
// Each side's fleet goes into a secret pile only its admiral can read: the
// seventeen squares it covers, and a line for each ship saying which squares
// are its. A shot is the database being asked "is C7 in that pile?" -- it
// answers yes or no, writes the question and the answer down where everyone
// can see them, and never shows anybody the rest. So nobody's browser holds
// the other fleet, not even for a moment.
//
// Whose ship went down is the one thing only its owner can tell, since only
// the owner knows which squares belong to which ship; their screen announces
// it as soon as the last square of a ship is hit.

import type { PileMeta } from "./piles";

export const SIZE = 10;
export const COLS = "ABCDEFGHIJ";

export type Chair = "a" | "b";
export const CHAIRS: Chair[] = ["a", "b"];
export const other = (chair: Chair): Chair => (chair === "a" ? "b" : "a");

export interface ShipKind {
  id: string;
  name: string;
  size: number;
}

/** The classic fleet: five ships, seventeen squares. */
export const FLEET: ShipKind[] = [
  { id: "carrier", name: "carrier", size: 5 },
  { id: "battleship", name: "battleship", size: 4 },
  { id: "cruiser", name: "cruiser", size: 3 },
  { id: "submarine", name: "submarine", size: 3 },
  { id: "destroyer", name: "destroyer", size: 2 },
];

export const FLEET_SQUARES = FLEET.reduce((sum, ship) => sum + ship.size, 0);

export interface Placement {
  ship: string;
  row: number;
  col: number;
  /** Lying left to right; otherwise top to bottom. */
  across: boolean;
}

export interface Ship {
  ship: string;
  cells: string[];
}

export interface Shot {
  cell: string;
  hit: boolean;
}

export interface BattleshipState {
  version: 1;
  seats: Record<Chair, string | null>;
  holders?: Record<Chair, string | null>;
  turn: Chair;
  /** The shots each side has fired, at the other side's waters. */
  shots: Record<Chair, Shot[]>;
  /** Each side's ships that have gone down, as their owner announced them. */
  sunk: Record<Chair, Ship[]>;
  /** A hit earns another shot, the way a lot of tables play it. */
  again: boolean;
  winner?: Chair | null;
  /** Written by the database. */
  piles?: PileMeta;
}

export function emptyBattleship(): BattleshipState {
  return {
    version: 1,
    seats: { a: null, b: null },
    holders: { a: null, b: null },
    turn: "a",
    shots: { a: [], b: [] },
    sunk: { a: [], b: [] },
    again: false,
    winner: null,
  };
}

export function upgradeBattleship(state: unknown): BattleshipState {
  const s = (state ?? {}) as Partial<BattleshipState>;
  if (s.version !== 1) return emptyBattleship();
  return {
    ...emptyBattleship(),
    ...s,
    shots: { a: s.shots?.a ?? [], b: s.shots?.b ?? [] },
    sunk: { a: s.sunk?.a ?? [], b: s.sunk?.b ?? [] },
  };
}

export const cellName = (row: number, col: number) => `${COLS[col]}${row + 1}`;

export function cellAt(name: string): { row: number; col: number } | null {
  const col = COLS.indexOf(name[0]);
  const row = Number(name.slice(1)) - 1;
  if (col < 0 || !Number.isInteger(row) || row < 0 || row >= SIZE) return null;
  return { row, col };
}

/** The squares a ship would cover, or null if it would hang off the board. */
export function cellsOf(p: Placement): string[] | null {
  const kind = FLEET.find((s) => s.id === p.ship);
  if (!kind) return null;
  const out: string[] = [];
  for (let i = 0; i < kind.size; i += 1) {
    const row = p.row + (p.across ? 0 : i);
    const col = p.col + (p.across ? i : 0);
    if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) return null;
    out.push(cellName(row, col));
  }
  return out;
}

/** What is wrong with a fleet, if anything. */
export function fleetProblem(placements: Placement[]): string | null {
  const used = new Set<string>();
  for (const kind of FLEET) {
    const p = placements.find((x) => x.ship === kind.id);
    if (!p) return `the ${kind.name} is still in port`;
    const cells = cellsOf(p);
    if (!cells) return `the ${kind.name} is off the edge`;
    for (const cell of cells) {
      if (used.has(cell)) return `the ${kind.name} runs into another ship`;
      used.add(cell);
    }
  }
  return null;
}

/** Whether a ship fits there alongside the rest. */
export function fitsWith(placements: Placement[], p: Placement): boolean {
  const cells = cellsOf(p);
  if (!cells) return false;
  const taken = new Set(placements.filter((x) => x.ship !== p.ship).flatMap((x) => cellsOf(x) ?? []));
  return cells.every((cell) => !taken.has(cell));
}

/** A whole fleet set out at random, every ship somewhere it fits. */
export function randomFleet(random: () => number = Math.random): Placement[] {
  for (let tries = 0; tries < 50; tries += 1) {
    const out: Placement[] = [];
    let ok = true;
    for (const kind of FLEET) {
      let placed = false;
      for (let attempt = 0; attempt < 200 && !placed; attempt += 1) {
        const p = {
          ship: kind.id,
          row: Math.floor(random() * SIZE),
          col: Math.floor(random() * SIZE),
          across: random() < 0.5,
        };
        if (fitsWith(out, p)) {
          out.push(p);
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return out;
  }
  // Never reached in practice; a fleet in neat rows always fits.
  return FLEET.map((kind, i) => ({ ship: kind.id, row: i * 2, col: 0, across: true }));
}

// ---------------------------------------------------------------------------
// The fleet in its pile
// ---------------------------------------------------------------------------

export const fleetSlot = (chair: Chair) => `fleet:${chair}`;

/**
 * What goes into a side's pile: every square a ship covers, which is what a
 * shot is checked against, and one line per ship naming its squares, which
 * only the owner ever reads. No line of the second kind can be mistaken for a
 * square.
 */
export function fleetCards(placements: Placement[]): string[] {
  const squares = placements.flatMap((p) => cellsOf(p) ?? []);
  const ships = placements.map((p) => `${p.ship}:${(cellsOf(p) ?? []).join(",")}`);
  return [...squares, ...ships];
}

/** A pile read back into ships, by the only person who can read it. */
export function shipsIn(cards: unknown[]): Ship[] {
  return cards
    .filter((c): c is string => typeof c === "string" && c.includes(":"))
    .map((c) => {
      const [ship, cells] = c.split(":");
      return { ship, cells: cells ? cells.split(",") : [] };
    });
}

/** A side has put its fleet to sea. */
export const ready = (piles: PileMeta | undefined, chair: Chair) => (piles?.[fleetSlot(chair)]?.size ?? 0) >= FLEET_SQUARES;

// ---------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------

export const hitsBy = (state: BattleshipState, chair: Chair) => state.shots[chair].filter((s) => s.hit).length;

/**
 * A shot and what came of it. The turn passes on a miss -- and on a hit too,
 * unless the table plays that a hit earns another -- and seventeen hits is
 * every ship in the other fleet.
 */
export function afterShot(state: BattleshipState, chair: Chair, cell: string, hit: boolean): BattleshipState {
  if (state.winner || state.shots[chair].some((s) => s.cell === cell)) return state;
  const shots = { ...state.shots, [chair]: [...state.shots[chair], { cell, hit }] };
  const next: BattleshipState = { ...state, shots };
  if (hitsBy(next, chair) >= FLEET_SQUARES) {
    next.winner = chair;
    return next;
  }
  next.turn = hit && state.again ? chair : other(chair);
  return next;
}

/** Ships of this side that the other side has now hit in every square, and nobody has said so yet. */
export function newlySunk(ships: Ship[], against: Shot[], already: Ship[]): Ship[] {
  const hit = new Set(against.filter((s) => s.hit).map((s) => s.cell));
  return ships.filter((ship) => !already.some((s) => s.ship === ship.ship) && ship.cells.length > 0 && ship.cells.every((c) => hit.has(c)));
}

/** The name a ship goes by. */
export const shipName = (id: string) => FLEET.find((s) => s.id === id)?.name ?? id;
